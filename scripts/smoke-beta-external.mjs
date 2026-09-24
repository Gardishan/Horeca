import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const mode = process.argv[2];
const supportedModes = new Set(["preflight", "full", "create-marker", "verify-marker"]);

if (!supportedModes.has(mode)) {
  throw new Error(`Expected one of: ${[...supportedModes].join(", ")}`);
}

const origin = new URL(process.env.BETA_BASE_URL ?? "");
if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("BETA_BASE_URL must be an HTTPS origin");
}

const betaAccessToken = process.env.BETA_ACCESS_TOKEN ?? "";
const expectedDeploymentVersion = process.env.EXPECTED_DEPLOYMENT_VERSION ?? "";
const markerPath = process.env.BETA_MARKER_PATH ?? "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CookieClient {
  #cookies = new Map();

  #absorb(response) {
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    for (const setCookie of setCookies) {
      const pair = setCookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) this.#cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return setCookies;
  }

  async fetch(path, init = {}) {
    const headers = new Headers(init.headers);
    if (this.#cookies.size > 0) {
      headers.set("Cookie", [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const response = await fetch(new URL(path, origin), {
      ...init,
      headers,
      redirect: init.redirect ?? "manual",
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    const setCookies = this.#absorb(response);
    return { response, setCookies };
  }

  async json(path, init = {}) {
    const result = await this.fetch(path, init);
    let payload;
    try {
      payload = await result.response.json();
    } catch {
      throw new Error(`${path} returned non-JSON status ${result.response.status}`);
    }
    return { ...result, payload };
  }
}

async function grantBetaAccess(client, token = betaAccessToken) {
  assert(token.length >= 32, "BETA_ACCESS_TOKEN is missing or too short");
  const { response, payload, setCookies } = await client.json("/api/beta-access", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin.origin },
    body: JSON.stringify({ accessToken: token }),
  });
  assert(response.status === 200 && payload.ok && payload.data.access === "granted", "Beta invite exchange failed");
  const betaCookie = setCookies.find((value) => value.startsWith("horeca_beta_access="));
  assert(betaCookie, "Beta access cookie is missing");
  assert(/;\s*HttpOnly/i.test(betaCookie), "Beta access cookie is not HttpOnly");
  assert(/;\s*Secure/i.test(betaCookie), "Beta access cookie is not Secure");
  assert(/;\s*SameSite=Strict/i.test(betaCookie), "Beta access cookie is not SameSite=Strict");
}

async function login(client, email) {
  const { response, payload, setCookies } = await client.json("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin.origin },
    body: JSON.stringify({ email, password: "demo123" }),
  });
  assert(response.status === 200 && payload.ok, `Demo login failed for ${email}`);
  assert(setCookies.some((value) => value.startsWith("horeca_session=")), `Session cookie is missing for ${email}`);
  return payload.data;
}

async function expectLive() {
  const client = new CookieClient();
  const { response, payload } = await client.json("/api/health/live");
  assert(response.status === 200 && payload.ok && payload.data.status === "alive", "External liveness failed");
  assert(response.headers.get("cache-control")?.includes("no-store"), "Liveness response is cacheable");
}

async function runPreflight() {
  await expectLive();
  const client = new CookieClient();
  const readiness = await client.json("/api/health/ready");
  assert(
    readiness.response.status === 503 && readiness.payload.error?.code === "NOT_READY",
    "Readiness must remain closed while BETA_ENABLED=false",
  );
  const catalog = await client.json("/api/catalog/products");
  assert(
    catalog.response.status === 503 && catalog.payload.error?.code === "BETA_DISABLED",
    "Beta traffic kill switch is not closed during preflight",
  );
  return ["external HTTPS liveness", "readiness closed", "traffic kill switch closed"];
}

async function runFull() {
  await expectLive();

  const anonymous = new CookieClient();
  const readiness = await anonymous.json("/api/health/ready");
  assert(readiness.response.status === 200 && readiness.payload.ok, "External readiness failed");
  assert(
    !expectedDeploymentVersion || readiness.payload.data.deploymentVersion === expectedDeploymentVersion,
    "Readiness reports a different deployment version",
  );

  const page = await anonymous.fetch("/catalog");
  assert([307, 308].includes(page.response.status), "Anonymous page request did not redirect to the invite gate");
  assert(page.response.headers.get("location")?.includes("/beta-access"), "Invite redirect target is missing");
  const anonymousCatalog = await anonymous.json("/api/catalog/products");
  assert(
    anonymousCatalog.response.status === 401 && anonymousCatalog.payload.error?.code === "BETA_ACCESS_REQUIRED",
    "Anonymous API request bypassed the invite gate",
  );

  const invalid = new CookieClient();
  const invalidGrant = await invalid.json("/api/beta-access", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin.origin },
    body: JSON.stringify({ accessToken: "invalid-beta-access-token-value" }),
  });
  assert(invalidGrant.response.status === 401, "Invalid Beta invite token was accepted");

  const supplier = new CookieClient();
  await grantBetaAccess(supplier);
  const catalog = await supplier.json("/api/catalog/products");
  assert(catalog.response.status === 200 && catalog.payload.data.items.length >= 1, "Invite-gated catalog is unavailable");
  const supplierIdentity = await login(supplier, "supplier@horeca.kz");
  assert(supplierIdentity.role === "SUPPLIER", "Supplier login returned an unexpected role");
  const supplierMe = await supplier.json("/api/auth/me");
  assert(supplierMe.response.status === 200 && supplierMe.payload.data.role === "SUPPLIER", "Supplier session readback failed");
  const supplierDashboard = await supplier.json("/api/dashboard/company");
  assert(supplierDashboard.response.status === 200 && supplierDashboard.payload.data.company.id === "company-active", "Supplier authorization failed");
  const supplierAdmin = await supplier.json("/api/admin/companies");
  assert(supplierAdmin.response.status === 403, "Supplier crossed the admin authorization boundary");

  const betaOnly = new CookieClient();
  await grantBetaAccess(betaOnly);
  const noSessionDashboard = await betaOnly.json("/api/dashboard/company");
  assert(noSessionDashboard.response.status === 401, "Invite access bypassed application authentication");

  const admin = new CookieClient();
  await grantBetaAccess(admin);
  const adminIdentity = await login(admin, "admin@horeca.kz");
  assert(adminIdentity.role === "ADMIN", "Admin login returned an unexpected role");
  const companies = await admin.json("/api/admin/companies");
  assert(companies.response.status === 200 && companies.payload.data.length >= 2, "Admin authorization failed");

  for (const path of [
    "/api/admin/documents/document-registration-active/download",
    "/api/admin/payments/payment-pending/proof",
  ]) {
    const denied = await supplier.fetch(path);
    assert(denied.response.status === 403, "Supplier downloaded an admin-only private file");
    const downloaded = await admin.fetch(path);
    const bytes = Buffer.from(await downloaded.response.arrayBuffer());
    assert(downloaded.response.ok && bytes.subarray(0, 5).toString() === "%PDF-", "Seeded private document or payment proof is absent from runtime storage");
    assert(downloaded.response.headers.get("cache-control")?.includes("no-store"), "Private file response is cacheable");
  }

  return [
    "HTTPS liveness and readiness",
    "anonymous invite enforcement",
    "invalid invite rejection",
    "secure invite cookie",
    "demo authentication",
    "supplier authorization",
    "admin authorization",
    "cross-role denial",
    "seeded private document and payment proof downloads",
  ];
}

async function runCreateMarker() {
  assert(markerPath, "BETA_MARKER_PATH is required");
  const supplier = new CookieClient();
  await grantBetaAccess(supplier);
  await login(supplier, "supplier@horeca.kz");
  const before = await supplier.json("/api/dashboard/company");
  assert(before.response.status === 200, "Supplier dashboard is unavailable before marker creation");
  const beforeCount = before.payload.data.company._count.buyerRequests;

  const nonce = randomUUID();
  const compactNonce = nonce.replaceAll("-", "");
  const markerLabel = `beta-persistence-${nonce}`;
  const created = await supplier.json("/api/buyer-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin.origin },
    body: JSON.stringify({
      productId: "product-coffee",
      buyerName: "Beta Persistence Probe",
      buyerCompany: markerLabel,
      phone: "+77010000000",
      email: `beta+${compactNonce}@example.test`,
      message: `Synthetic persistence marker ${markerLabel}`,
      quantity: 1,
      website: "",
    }),
  });
  assert(created.response.status === 201 && created.payload.ok, "Persistence marker creation failed");

  const after = await supplier.json("/api/dashboard/company");
  const afterCount = after.payload.data.company._count.buyerRequests;
  assert(after.response.status === 200 && afterCount === beforeCount + 1, "Persistence marker count was not committed");

  const pendingSupplier = new CookieClient();
  await grantBetaAccess(pendingSupplier);
  await login(pendingSupplier, "pending@horeca.kz");
  const fileBytes = Buffer.from(`%PDF-1.4\n% Synthetic Beta persistence probe ${nonce}\n%%EOF\n`);
  const form = new FormData();
  form.set("type", "OTHER");
  form.set("demoMaterialAcknowledged", "true");
  form.set("file", new Blob([fileBytes], { type: "application/pdf" }), "beta-persistence.pdf");
  const uploaded = await pendingSupplier.json("/api/dashboard/company/documents", {
    method: "POST", headers: { Origin: origin.origin }, body: form,
  });
  assert(uploaded.response.status === 201 && uploaded.payload.ok, "Synthetic private-file persistence marker upload failed");

  const marker = {
    id: created.payload.data.id,
    label: markerLabel,
    beforeCount,
    afterCount,
    createdAt: created.payload.data.createdAt,
    documentId: uploaded.payload.data.id,
    documentSha256: createHash("sha256").update(fileBytes).digest("hex"),
  };
  await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  return { checks: ["unique PostgreSQL marker created", "supplier count incremented", "synthetic private-file marker uploaded"], markerId: marker.id };
}

async function runVerifyMarker() {
  assert(markerPath, "BETA_MARKER_PATH is required");
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  assert(typeof marker.documentId === "string" && typeof marker.documentSha256 === "string", "Private-file persistence marker is missing");
  const supplier = new CookieClient();
  await grantBetaAccess(supplier);
  await login(supplier, "supplier@horeca.kz");
  const dashboard = await supplier.json("/api/dashboard/company");
  assert(dashboard.response.status === 200, "Supplier dashboard is unavailable during marker verification");
  assert(
    dashboard.payload.data.company._count.buyerRequests >= marker.afterCount,
    "Supplier marker count regressed after provider lifecycle action",
  );
  const admin = new CookieClient();
  await grantBetaAccess(admin);
  await login(admin, "admin@horeca.kz");
  const downloaded = await admin.fetch(`/api/admin/documents/${encodeURIComponent(marker.documentId)}/download`);
  assert(downloaded.response.ok, "Private-file marker did not survive provider lifecycle action");
  const fileBytes = Buffer.from(await downloaded.response.arrayBuffer());
  assert(createHash("sha256").update(fileBytes).digest("hex") === marker.documentSha256, "Private-file marker changed after provider lifecycle action");
  return { checks: ["external marker count retained", "private-file marker SHA-256 retained"], markerId: marker.id };
}

const result = mode === "preflight"
  ? { checks: await runPreflight() }
  : mode === "full"
    ? { checks: await runFull() }
    : mode === "create-marker"
      ? await runCreateMarker()
      : await runVerifyMarker();

console.log(JSON.stringify({ ok: true, mode, origin: origin.origin, ...result }, null, 2));
