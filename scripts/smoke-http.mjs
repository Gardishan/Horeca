import { spawn } from "node:child_process";
import process from "node:process";

const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3100";
const port = new URL(origin).port || "3100";
const app = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", port], {
  env: { ...process.env, APP_URL: origin, NEXT_PUBLIC_APP_URL: origin },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
app.stdout.on("data", (chunk) => { logs += chunk.toString(); });
app.stderr.on("data", (chunk) => { logs += chunk.toString(); });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/catalog/products`);
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
  const response = await fetch(`${origin}${path}`, init);
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

  const catalog = await json("/api/catalog/products");
  assert(catalog.response.ok && catalog.payload.data.items.length === 4, "Catalog trust filter returned an unexpected product set");
  assert(catalog.payload.data.items.every((item) => item.company.name === "Qazaq Coffee & Food Supply"), "Unverified supplier leaked into catalog");
  checks.push("public catalog trust filter");

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
  const document = await fetch(`${origin}/api/admin/documents/document-registration-active/download`, { headers: { Cookie: adminCookie } });
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
    const timeout = setTimeout(resolve, 2_000);
    app.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
}

