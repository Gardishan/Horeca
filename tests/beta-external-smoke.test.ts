import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const origin = "https://beta.example.test";
const accessToken = "synthetic-beta-access-token-with-at-least-32-characters";
const deploymentVersion = "synthetic-release-commit";
const seedPaths = [
  "/api/admin/documents/document-registration-active/download",
  "/api/admin/payments/payment-pending/proof",
];
const originalArgv = process.argv;
const scriptUrl = pathToFileURL(path.join(process.cwd(), "scripts/smoke-beta-external.mjs")).href;

type FixtureOptions = {
  missingSeedPath?: string;
  supplierDownloadPath?: string;
  cacheableSeedPath?: string;
  markerDownload?: "missing" | "changed";
};

function betaServer(options: FixtureOptions = {}) {
  let requestCount = 3;
  let markerBytes = Buffer.from("%PDF-1.4\nSynthetic retained marker\n%%EOF\n");
  const requests: Array<{ pathname: string; identity: string | undefined }> = [];
  const ok = (data: unknown, init?: ResponseInit) => Response.json({ ok: true, data }, init);
  const denied = (status: number, code = "FORBIDDEN") => (
    Response.json({ ok: false, error: { code } }, { status })
  );
  const pdf = (bytes: Buffer, cacheable = false) => new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": cacheable ? "public" : "no-store" },
  });

  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin).toBe(origin);
    const headers = new Headers(init.headers);
    const cookies = headers.get("cookie") ?? "";
    const hasBetaAccess = cookies.includes("horeca_beta_access=fixture");
    const identity = /horeca_session=([^;]+)/.exec(cookies)?.[1];
    const role = identity === "admin" ? "ADMIN" : "SUPPLIER";
    const pathname = url.pathname;
    requests.push({ pathname, identity });
    if (init.method === "POST") expect(headers.get("origin")).toBe(origin);

    if (pathname === "/api/health/live") {
      return ok({ status: "alive" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (pathname === "/api/health/ready") return ok({ deploymentVersion });
    if (pathname === "/catalog") {
      return new Response(null, { status: 307, headers: { Location: `${origin}/beta-access` } });
    }
    if (pathname === "/api/beta-access") {
      const body = JSON.parse(String(init.body));
      return body.accessToken === accessToken
        ? ok({ access: "granted" }, {
          headers: { "Set-Cookie": "horeca_beta_access=fixture; HttpOnly; Secure; SameSite=Strict" },
        })
        : denied(401);
    }
    if (!hasBetaAccess) return denied(401, "BETA_ACCESS_REQUIRED");
    if (pathname === "/api/catalog/products") return ok({ items: [{ id: "product-coffee" }] });
    if (pathname === "/api/auth/login") {
      const body = JSON.parse(String(init.body));
      expect(body.password).toBe("demo123");
      const account = String(body.email).split("@")[0];
      expect(["supplier", "pending", "admin"]).toContain(account);
      return ok({ role: account === "admin" ? "ADMIN" : "SUPPLIER" }, {
        headers: { "Set-Cookie": `horeca_session=${account}; HttpOnly; Secure; SameSite=Strict` },
      });
    }
    if (!identity) return denied(401);
    if (pathname === "/api/auth/me") return ok({ role });
    if (pathname === "/api/dashboard/company") {
      return ok({ company: { id: "company-active", _count: { buyerRequests: requestCount } } });
    }
    if (pathname === "/api/admin/companies") {
      return identity === "admin" ? ok([{ id: "company-active" }, { id: "company-pending" }]) : denied(403);
    }
    if (seedPaths.includes(pathname)) {
      if (identity !== "admin" && pathname !== options.supplierDownloadPath) return denied(403);
      if (pathname === options.missingSeedPath) return denied(404, "NOT_FOUND");
      return pdf(Buffer.from("%PDF-1.4\nSynthetic seed file\n%%EOF\n"), pathname === options.cacheableSeedPath);
    }
    if (pathname === "/api/buyer-requests") {
      expect(identity).toBe("supplier");
      const body = JSON.parse(String(init.body));
      expect(body.buyerCompany).toMatch(/^beta-persistence-/);
      expect(body.betaDemoAcknowledged).toBe(true);
      requestCount += 1;
      return ok({ id: "buyer-marker", createdAt: "2026-09-24T00:00:00Z" }, { status: 201 });
    }
    if (pathname === "/api/dashboard/company/documents") {
      expect(identity).toBe("pending");
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      expect(form.get("type")).toBe("OTHER");
      expect(form.get("demoMaterialAcknowledged")).toBe("true");
      const file = form.get("file");
      expect(file).toBeInstanceOf(Blob);
      markerBytes = Buffer.from(await (file as Blob).arrayBuffer());
      return ok({ id: "document-marker" }, { status: 201 });
    }
    if (pathname === "/api/admin/documents/document-marker/download") {
      if (identity !== "admin") return denied(403);
      if (options.markerDownload === "missing") return denied(404, "NOT_FOUND");
      return pdf(options.markerDownload === "changed" ? Buffer.from("changed bytes") : markerBytes);
    }
    throw new Error(`Unexpected fixture request: ${pathname}`);
  });

  return { fetch, requests, get markerBytes() { return markerBytes; } };
}

let directory: string;
let markerPath: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "horeca-beta-smoke-test-"));
  markerPath = path.join(directory, "marker.json");
  vi.stubEnv("BETA_BASE_URL", origin);
  vi.stubEnv("BETA_ACCESS_TOKEN", accessToken);
  vi.stubEnv("EXPECTED_DEPLOYMENT_VERSION", deploymentVersion);
  vi.stubEnv("BETA_MARKER_PATH", markerPath);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  process.argv = originalArgv;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function runSmoke(mode: string, server: ReturnType<typeof betaServer>) {
  vi.resetModules();
  vi.stubGlobal("fetch", server.fetch);
  process.argv = [originalArgv[0], "scripts/smoke-beta-external.mjs", mode];
  await import(/* @vite-ignore */ scriptUrl);
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0] as string);
}

async function writeMarker(server: ReturnType<typeof betaServer>, extra = {}) {
  await writeFile(markerPath, JSON.stringify({
    id: "buyer-marker",
    afterCount: 3,
    documentId: "document-marker",
    documentSha256: createHash("sha256").update(server.markerBytes).digest("hex"),
    ...extra,
  }));
}

describe("external Beta smoke against controlled HTTP fixtures", () => {
  it("verifies full access, role boundaries and both seeded private files", async () => {
    const server = betaServer();
    const result = await runSmoke("full", server);

    expect(result.ok).toBe(true);
    expect(result.checks).toContain("seeded private document and payment proof downloads");
    for (const pathname of seedPaths) {
      expect(server.requests.filter((request) => request.pathname === pathname)).toEqual([
        { pathname, identity: "supplier" },
        { pathname, identity: "admin" },
      ]);
    }
  });

  it.each(seedPaths)("rejects missing seeded private file %s", async (missingSeedPath) => {
    await expect(runSmoke("full", betaServer({ missingSeedPath }))).rejects.toThrow(
      "Seeded private document or payment proof is absent from runtime storage",
    );
  });

  it.each(seedPaths)("rejects supplier access to private file %s", async (supplierDownloadPath) => {
    await expect(runSmoke("full", betaServer({ supplierDownloadPath }))).rejects.toThrow(
      "Supplier downloaded an admin-only private file",
    );
  });

  it.each(seedPaths)("rejects cacheable private file %s", async (cacheableSeedPath) => {
    await expect(runSmoke("full", betaServer({ cacheableSeedPath }))).rejects.toThrow(
      "Private file response is cacheable",
    );
  });

  it("creates a real upload marker and verifies the same bytes after a lifecycle action", async () => {
    const server = betaServer();
    const created = await runSmoke("create-marker", server);
    const marker = JSON.parse(await readFile(markerPath, "utf8"));

    expect(created.ok).toBe(true);
    expect(marker).toMatchObject({
      id: "buyer-marker",
      beforeCount: 3,
      afterCount: 4,
      documentId: "document-marker",
      documentSha256: createHash("sha256").update(server.markerBytes).digest("hex"),
    });
    expect(server.markerBytes.toString()).toContain("Synthetic Beta persistence probe");
    const verified = await runSmoke("verify-marker", server);
    expect(verified.ok).toBe(true);
    expect(verified.checks).toContain("private-file marker SHA-256 retained");
  });

  it("rejects a private file lost after redeploy", async () => {
    const server = betaServer({ markerDownload: "missing" });
    await writeMarker(server);
    await expect(runSmoke("verify-marker", server)).rejects.toThrow(
      "Private-file marker did not survive provider lifecycle action",
    );
  });

  it("rejects altered private-file bytes after redeploy", async () => {
    const server = betaServer({ markerDownload: "changed" });
    await writeMarker(server);
    await expect(runSmoke("verify-marker", server)).rejects.toThrow(
      "Private-file marker changed after provider lifecycle action",
    );
  });

  it("rejects a persistence marker without the private-file hash", async () => {
    const server = betaServer();
    await writeMarker(server, { documentSha256: undefined });
    await expect(runSmoke("verify-marker", server)).rejects.toThrow(
      "Private-file persistence marker is missing",
    );
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it("rejects lost database state even when file bytes survive", async () => {
    const server = betaServer();
    await writeMarker(server, { afterCount: 4 });
    await expect(runSmoke("verify-marker", server)).rejects.toThrow(
      "Supplier marker count regressed after provider lifecycle action",
    );
  });
});
