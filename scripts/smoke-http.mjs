import { spawn } from "node:child_process";
import process from "node:process";
import { join } from "node:path";

const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3100";
const smokeUrl = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(smokeUrl.hostname)) {
  throw new Error("smoke:http may only launch against a local origin");
}
const port = smokeUrl.port || "3100";
const standaloneServer = join(process.cwd(), ".next", "standalone", "server.js");
const app = spawn(process.execPath, [standaloneServer], {
  env: {
    ...process.env,
    APP_ENV: "test",
    DEPLOYMENT_VERSION: "http-smoke",
    APP_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    PRIVATE_STORAGE_MODE: "filesystem",
    DEMO_AUTH_ENABLED: "true",
    RATE_LIMIT_MODE: "memory",
    RATE_LIMIT_ALLOW_IN_MEMORY: "true",
    MALWARE_SCAN_MODE: "mock",
    HOSTNAME: "127.0.0.1",
    PORT: port,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
app.stdout.on("data", (chunk) => { logs += chunk.toString(); });
app.stderr.on("data", (chunk) => { logs += chunk.toString(); });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

  const request = await json("/api/buyer-requests", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "product-coffee", buyerName: "Smoke Buyer", buyerCompany: "Smoke Cafe", phone: "+77010000000", email: "buyer@example.kz", message: "Прошу направить тестовое коммерческое предложение.", quantity: 10, website: "" }),
  });
  assert(request.response.status === 201, "Buyer request was not created");
  checks.push("buyer request flow");

  const adminCookie = await login("admin@horeca.kz");
  const companies = await json("/api/admin/companies", { headers: { Cookie: adminCookie } });
  assert(companies.response.ok && companies.payload.data.length >= 2, "Admin companies API is unavailable");
  const document = await fetch(`${origin}/api/admin/documents/document-registration-active/download`, {
    headers: { Cookie: adminCookie },
    signal: AbortSignal.timeout(10_000),
  });
  const bytes = Buffer.from(await document.arrayBuffer());
  assert(document.ok && bytes.subarray(0, 5).toString() === "%PDF-", "Protected document download failed");
  checks.push("admin access and protected document download");

  return checks;
}

try {
  const checks = await run();
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} catch (error) {
  console.error(error);
  console.error(logs);
  process.exitCode = 1;
} finally {
  app.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      app.kill("SIGKILL");
      resolve();
    }, 2_000);
    app.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
  app.stdout.destroy();
  app.stderr.destroy();
}
