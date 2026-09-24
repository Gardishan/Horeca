import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3100";
const smokeUrl = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(smokeUrl.hostname)) {
  throw new Error("smoke:http may only launch against a local origin");
}
const port = smokeUrl.port || "3100";
const standaloneSource = join(process.cwd(), ".next", "standalone");
const privateStorageRoot = resolve(process.env.PRIVATE_STORAGE_ROOT ?? "./storage/private");
let isolatedRoot;
let app;
let appStopped;
let startupError;
let logs = "";

function containsPath(root, target) {
  const pathFromRoot = relative(root, target);
  return !isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`);
}

async function assertSelfContainedLinks(directory, root) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try { target = await realpath(entryPath); } catch {
        throw new Error("Standalone artifact contains a broken symbolic link");
      }
      if (!containsPath(root, target)) {
        throw new Error("Standalone artifact contains a symbolic link outside its runtime root");
      }
    } else if (entry.isDirectory()) {
      await assertSelfContainedLinks(entryPath, root);
    }
  }
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (startupError || app.exitCode !== null || app.signalCode !== null) {
      throw new Error(`Isolated Next.js server stopped before becoming ready.\n${logs}`);
    }
    try {
      const response = await fetch(`${origin}/api/catalog/products`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become ready.\n${logs}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init = {}) {
  const response = await fetch(`${origin}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(10_000) });
  const payload = await response.json();
  return { response, payload };
}

async function login(email) {
  const { response, payload } = await json("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password: "demo123" }),
  });
  assert(response.ok && payload.ok, `Login failed for ${email}`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, `Session cookie missing for ${email}`);
  return cookie;
}

async function run() {
  await waitUntilReady();
  const checks = [];

  const liveness = await json("/api/health/live");
  assert(
    liveness.response.ok && liveness.payload.data.status === "alive",
    "Liveness probe is unavailable",
  );
  const readiness = await json("/api/health/ready");
  assert(
    readiness.response.ok &&
      readiness.payload.data.status === "ready" &&
      readiness.payload.data.deploymentVersion === "http-smoke",
    "Readiness probe did not verify runtime configuration and PostgreSQL",
  );
  assert(
    readiness.response.headers.get("cache-control")?.includes("no-store"),
    "Readiness response is cacheable",
  );
  checks.push("liveness and dependency-aware readiness probes");

  const firstPage = await fetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) });
  const secondPage = await fetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) });
  const firstCsp = firstPage.headers.get("content-security-policy") ?? "";
  const secondCsp = secondPage.headers.get("content-security-policy") ?? "";
  const shellHtml = await firstPage.clone().text();
  const staticAssetPath = shellHtml.match(/\/_next\/static\/[^"'<> ]+/)?.[0];
  assert(firstPage.ok && secondPage.ok, "Application shell is unavailable");
  assert(staticAssetPath, "Standalone shell does not reference a static asset");
  const staticAsset = await fetch(`${origin}${staticAssetPath}`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert(staticAsset.ok, "Standalone static asset is unavailable");
  assert(firstCsp.includes("'strict-dynamic'") && firstCsp.includes("'nonce-"), "Nonce CSP is missing");
  assert(!firstCsp.includes("'unsafe-inline'") && !firstCsp.includes("'unsafe-eval'"), "Production CSP contains an unsafe exception");
  assert(firstCsp !== secondCsp, "CSP nonce was reused across requests");
  assert(firstPage.headers.get("strict-transport-security")?.includes("max-age=63072000"), "Production HSTS is missing");
  assert(firstPage.headers.get("x-content-type-options") === "nosniff", "Security headers are missing");
  checks.push("standalone static assets, per-request CSP nonce and production security headers");

  const catalog = await json("/api/catalog/products");
  assert(catalog.response.ok && catalog.payload.data.items.length === 4, "Catalog trust filter returned an unexpected product set");
  assert(catalog.payload.data.items.every((item) => item.company.name === "Qazaq Coffee & Food Supply"), "Unverified supplier leaked into catalog");
  assert(catalog.response.headers.get("cache-control")?.includes("no-store"), "API response is cacheable");
  checks.push("public catalog trust filter");

  for (const query of ["page=abc", "page=1.5", "pageSize=Infinity", "availability=INVALID"]) {
    const invalidCatalog = await json(`/api/catalog/products?${query}`);
    assert(invalidCatalog.response.status === 422 && invalidCatalog.payload.error.code === "VALIDATION_ERROR", "Invalid catalog query reached the database");
  }
  const invalidCatalogPage = await fetch(`${origin}/catalog?page=abc`);
  assert(invalidCatalogPage.ok && (await invalidCatalogPage.text()).includes("Некорректные параметры поиска"), "Invalid catalog page has no recovery state");
  checks.push("catalog query validation and page recovery");

  const missingOrigin = await json("/api/buyer-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert(missingOrigin.response.status === 403 && missingOrigin.payload.error.code === "CSRF_REJECTED", "Mutation without Origin was accepted");
  const crossSite = await json("/api/buyer-requests", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json" },
    body: "{}",
  });
  assert(crossSite.response.status === 403 && crossSite.payload.error.code === "CSRF_REJECTED", "Cross-site mutation was accepted");
  checks.push("mutation Origin and Fetch Metadata negative paths");

  const supplierCookie = await login("supplier@horeca.kz");
  const dashboard = await json("/api/dashboard/company", { headers: { Cookie: supplierCookie } });
  assert(dashboard.response.ok && dashboard.payload.data.company.status === "ACTIVE", "Supplier dashboard is unavailable");
  const featuredBypass = await json("/api/dashboard/products/product-coffee", {
    method: "PUT",
    headers: { Cookie: supplierCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ isFeatured: true }),
  });
  assert(
    featuredBypass.response.status === 422 &&
      featuredBypass.payload.error.code === "VALIDATION_ERROR",
    "Supplier changed the admin-only featured flag",
  );
  checks.push("supplier authenticated dashboard");

  const forbidden = await json("/api/admin/companies", { headers: { Cookie: supplierCookie } });
  assert(forbidden.response.status === 403, "Supplier unexpectedly accessed admin API");
  checks.push("role-based admin boundary");

  const pendingCookie = await login("pending@horeca.kz");
  const blockedPublish = await json("/api/dashboard/products/product-milk/publish", {
    method: "POST",
    headers: { Cookie: pendingCookie, Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  });
  assert(blockedPublish.response.status === 409 && blockedPublish.payload.error.details.reasons.length > 0, "Ineligible supplier published a product");
  checks.push("publication invariant");
  const supersededPlan = await json("/api/dashboard/company/billing/select-plan", {
    method: "POST",
    headers: { Cookie: pendingCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ planCode: "PREMIUM" }),
  });
  assert(
    supersededPlan.response.ok && supersededPlan.payload.data.status === "PENDING_PAYMENT",
    "Supplier could not supersede a pending plan",
  );
  const newPlanBilling = await fetch(`${origin}/dashboard/company/billing`, { headers: { Cookie: pendingCookie } });
  assert(newPlanBilling.ok && (await newPlanBilling.text()).includes("Сформировать счёт"), "Old invoice hid invoice creation for the new plan");
  const newPlanInvoice = await json("/api/dashboard/company/billing/generate-invoice", {
    method: "POST",
    headers: { Cookie: pendingCookie, Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  });
  assert(newPlanInvoice.response.ok && newPlanInvoice.payload.data.subscriptionId === supersededPlan.payload.data.id, "New invoice does not belong to the selected plan");
  checks.push("new plan invoice generation despite an existing invoice");

  const request = await json("/api/buyer-requests", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "product-coffee", buyerName: "Smoke Buyer", buyerCompany: "Smoke Cafe", phone: "+77010000000", email: "buyer@example.kz", message: "Прошу направить тестовое коммерческое предложение.", quantity: 10, website: "" }),
  });
  assert(request.response.status === 201, "Buyer request was not created");
  const inbox = await json("/api/dashboard/requests", { headers: { Cookie: supplierCookie } });
  assert(inbox.response.ok && inbox.payload.data.items.some((item) => item.id === request.payload.data.id && item.email === "buyer@example.kz"), "Supplier did not receive the buyer request and contact details");
  assert(inbox.response.headers.get("cache-control")?.includes("no-store"), "Buyer contacts are cacheable");
  const foreignInbox = await json("/api/dashboard/requests?companyId=company-active", { headers: { Cookie: pendingCookie } });
  assert(foreignInbox.response.ok && !foreignInbox.payload.data.items.some((item) => item.id === request.payload.data.id), "Buyer request leaked into a different supplier inbox");
  const anonymousInbox = await json("/api/dashboard/requests");
  assert(anonymousInbox.response.status === 401, "Anonymous client read buyer contacts");
  const inboxPage = await fetch(`${origin}/dashboard/requests`, { headers: { Cookie: supplierCookie } });
  assert(inboxPage.ok && (await inboxPage.text()).includes("Smoke Cafe"), "Supplier inbox page did not render the request");
  checks.push("buyer request delivery, inbox and company isolation");

  const adminCookie = await login("admin@horeca.kz");
  const adminPage = await fetch(`${origin}/admin`, { headers: { Cookie: adminCookie } });
  assert(adminPage.ok && /<h1\b/.test(await adminPage.text()), "Admin server/client layout failed to render its page");
  const adminInbox = await json("/api/dashboard/requests", { headers: { Cookie: adminCookie } });
  assert(adminInbox.response.status === 403, "Admin session bypassed supplier-only inbox authorization");
  const companies = await json("/api/admin/companies", { headers: { Cookie: adminCookie } });
  assert(companies.response.ok && companies.payload.data.length >= 2, "Admin companies API is unavailable");
  const verifications = await json("/api/admin/verifications", { headers: { Cookie: adminCookie } });
  assert(verifications.response.ok, "Admin verifications API is unavailable");
  assert(
    !JSON.stringify([companies.payload, verifications.payload]).includes("proofFilePath"),
    "Admin API leaked a private payment proof storage path",
  );
  const stateBypass = await json("/api/admin/companies/company-active", {
    method: "PUT",
    headers: { Cookie: adminCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ACTIVE", verificationStatus: "APPROVED", isBlocked: false }),
  });
  assert(
    stateBypass.response.status === 422 &&
      stateBypass.payload.error.code === "VALIDATION_ERROR",
    "Generic company update accepted a critical state transition",
  );
  const reversedPayment = await json("/api/admin/payments/payment-active/reject", {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "Smoke test must not reverse a confirmed payment" }),
  });
  assert(
    reversedPayment.response.status === 409,
    "Confirmed payment was reversed through the rejection endpoint",
  );
  const reversedDocument = await json("/api/admin/documents/document-registration-active/reject", {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "Smoke test must not reverse an approved document" }),
  });
  assert(
    reversedDocument.response.status === 409,
    "Approved document was reversed through a terminal decision endpoint",
  );
  const reversedVerification = await json("/api/admin/verifications/verification-active/reject", {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "Smoke test must not reverse an approved verification" }),
  });
  assert(
    reversedVerification.response.status === 409,
    "Approved verification was reversed through a terminal decision endpoint",
  );
  const paymentProof = await fetch(`${origin}/api/admin/payments/payment-pending/proof`, {
    headers: { Cookie: adminCookie },
    signal: AbortSignal.timeout(10_000),
  });
  const paymentProofBytes = Buffer.from(await paymentProof.arrayBuffer());
  assert(
    paymentProof.ok && paymentProofBytes.subarray(0, 5).toString() === "%PDF-",
    "Admin could not review the private payment proof",
  );
  const rejectedPayment = await json("/api/admin/payments/payment-pending/reject", {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "Smoke test rejects the stale proof" }),
  });
  assert(rejectedPayment.response.ok, "Uploaded payment proof could not be rejected");
  const repeatedPaidSignal = await json("/api/dashboard/company/billing/mark-paid", {
    method: "POST",
    headers: { Cookie: pendingCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId: "invoice-pending" }),
  });
  assert(
    repeatedPaidSignal.response.ok && repeatedPaidSignal.payload.data.status === "PENDING",
    "Supplier paid signal resurrected a rejected payment proof",
  );
  const stalePayment = await json("/api/admin/payments/payment-pending/confirm", {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "Superseded invoice must stay inactive" }),
  });
  assert(
    stalePayment.response.status === 409,
    "Payment for a superseded plan reactivated its cancelled subscription",
  );
  const auditedCompany = await json("/api/admin/companies/company-pending", {
    headers: { Cookie: adminCookie },
  });
  assert(
    auditedCompany.response.ok &&
      auditedCompany.payload.data.auditLogs.some((entry) => entry.action === "PAYMENT_PROOF_DOWNLOADED"),
    "Payment proof download did not create audit evidence",
  );
  checks.push("private payment proof review and terminal trust transition guards");
  const document = await fetch(`${origin}/api/admin/documents/document-registration-active/download`, {
    headers: { Cookie: adminCookie },
    signal: AbortSignal.timeout(10_000),
  });
  const bytes = Buffer.from(await document.arrayBuffer());
  assert(document.ok && bytes.subarray(0, 5).toString() === "%PDF-", "Protected document download failed");
  checks.push("admin access and protected document download");

  const mutation = (cookie) => ({ Cookie: cookie, Origin: origin, "Content-Type": "application/json" });
  const unchangedNameEdit = await json("/api/dashboard/products/product-coffee", {
    method: "PUT",
    headers: mutation(supplierCookie),
    body: JSON.stringify({ name: "Кофе в зернах Arabica Blend 1 кг", price: 8900 }),
  });
  assert(unchangedNameEdit.response.ok && unchangedNameEdit.payload.data.slug === "arabica-blend-1kg", "Saving a product without renaming it rotated its public slug");
  const stableLink = await json("/api/catalog/products/arabica-blend-1kg");
  assert(stableLink.response.ok, "Existing catalog link broke after an edit without a rename");
  checks.push("product edit without rename keeps the public catalog link");

  const supplierModeration = await json("/api/admin/products/product-syrup/block", { method: "POST", headers: mutation(supplierCookie), body: "{}" });
  assert(supplierModeration.response.status === 403, "Supplier reached the admin product moderation API");
  const adminBlock = await json("/api/admin/products/product-syrup/block", { method: "POST", headers: mutation(adminCookie), body: "{}" });
  assert(adminBlock.response.ok && adminBlock.payload.data.status === "BLOCKED", "Admin could not block a product");
  for (const [path, method, body] of [
    ["/api/dashboard/products/product-syrup/publish", "POST", "{}"],
    ["/api/dashboard/products/product-syrup/hide", "POST", "{}"],
    ["/api/dashboard/products/product-syrup", "PUT", JSON.stringify({ price: 4200 })],
  ]) {
    const attempt = await json(path, { method, headers: mutation(supplierCookie), body });
    assert(attempt.response.status === 409 && attempt.payload.error.code === "CONFLICT", `Supplier overrode an admin product block via ${method} ${path}`);
  }
  const blockedLink = await json("/api/catalog/products/vanilla-syrup-1l");
  assert(blockedLink.response.status === 404, "Blocked product stayed in the public catalog");
  const unblock = await json("/api/admin/products/product-syrup/publish", { method: "POST", headers: mutation(adminCookie), body: "{}" });
  assert(unblock.response.ok && unblock.payload.data.status === "PUBLISHED", "Admin could not lift a product block");
  const restoredLink = await json("/api/catalog/products/vanilla-syrup-1l");
  assert(restoredLink.response.ok, "Unblocked product did not return to the public catalog");
  const moderationAudit = await json("/api/admin/companies/company-active", { headers: { Cookie: adminCookie } });
  const productActions = moderationAudit.response.ok
    ? moderationAudit.payload.data.auditLogs.filter((entry) => entry.entityType === "Product" && entry.entityId === "product-syrup").map((entry) => entry.action)
    : [];
  assert(productActions.includes("PRODUCT_BLOCKED") && productActions.includes("PRODUCT_PUBLISHED"), "Admin product moderation left no audit evidence");
  checks.push("admin product block is authoritative for the supplier, reversible by admin and audited");

  return checks;
}

try {
  // A sibling repository node_modules must never satisfy missing runtime files.
  isolatedRoot = await mkdtemp(join(tmpdir(), "horeca-http-smoke-"));
  const isolatedRealRoot = await realpath(isolatedRoot);
  if (containsPath(await realpath(process.cwd()), isolatedRealRoot)) {
    throw new Error("HTTP smoke requires a temporary directory outside the repository");
  }
  await cp(standaloneSource, isolatedRoot, { recursive: true, verbatimSymlinks: true });
  await assertSelfContainedLinks(isolatedRoot, isolatedRealRoot);
  app = spawn(process.execPath, [join(isolatedRoot, "server.js")], {
    cwd: isolatedRoot,
    env: {
      ...process.env,
      NODE_PATH: "",
      APP_ENV: "test",
      DEPLOYMENT_VERSION: "http-smoke",
      APP_URL: origin,
      NEXT_PUBLIC_APP_URL: origin,
      PRIVATE_STORAGE_MODE: "filesystem",
      PRIVATE_STORAGE_ROOT: privateStorageRoot,
      DEMO_AUTH_ENABLED: "true",
      RATE_LIMIT_MODE: "memory",
      RATE_LIMIT_ALLOW_IN_MEMORY: "true",
      MALWARE_SCAN_MODE: "mock",
      HOSTNAME: "127.0.0.1",
      PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appStopped = new Promise((resolveStopped) => app.once("close", resolveStopped));
  app.once("error", (error) => { startupError = error; });
  app.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  app.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  const checks = await run();
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} catch (error) {
  console.error(error);
  console.error(logs);
  process.exitCode = 1;
} finally {
  if (app) {
    const timeout = setTimeout(() => app.kill("SIGKILL"), 2_000);
    app.kill("SIGTERM");
    await appStopped;
    clearTimeout(timeout);
    app.stdout.destroy();
    app.stderr.destroy();
  }
  if (isolatedRoot) await rm(isolatedRoot, { recursive: true, force: true });
}
