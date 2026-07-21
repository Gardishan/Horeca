import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ValidatedUpload } from "@/lib/file-security";

vi.mock("server-only", () => ({}));

const {
  antivirusCheck,
  resolvePrivatePath,
  savePrivateUpload,
  validateUpload,
} = await import("@/lib/file-security");

const temporaryRoots: string[] = [];

const upload: ValidatedUpload = {
  originalName: "supplier-document.pdf",
  storedName: "generated-id.pdf",
  extension: ".pdf",
  mimeType: "application/pdf",
  size: 12,
  buffer: Buffer.from("%PDF-sample"),
};

function remoteScannerEnvironment() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("MALWARE_SCAN_MODE", "remote");
  vi.stubEnv("MALWARE_SCAN_BACKEND_URL", "https://scanner.example.kz/v1/scan");
  vi.stubEnv("MALWARE_SCAN_BACKEND_TOKEN", "scanner-token-that-must-never-leak");
  vi.stubEnv("MALWARE_SCAN_TIMEOUT_MS", "15000");
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

describe("upload validation and private storage", () => {
  it.each([
    ["document.pdf", "application/pdf", Buffer.from("%PDF-sample"), ".pdf"],
    ["photo.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00]), ".jpg"],
    ["photo.png", "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ".png"],
    ["legacy.doc", "application/msword", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), ".doc"],
    ["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK\u0003\u0004"), ".docx"],
  ])("accepts a validated %s signature", async (name, mimeType, bytes, extension) => {
    const result = await validateUpload(new File([bytes], name, { type: mimeType }));

    expect(result).toMatchObject({ originalName: name, extension, mimeType });
    expect(result.storedName).toMatch(new RegExp(`^[0-9a-f-]+\\${extension}$`));
    expect(result.buffer).toEqual(bytes);
  });

  it.each([
    ["blocked executable", new File(["MZ"], "payload.exe", { type: "application/octet-stream" }), "FILE_TYPE_REJECTED"],
    ["MIME mismatch", new File(["%PDF-sample"], "document.pdf", { type: "image/png" }), "MIME_MISMATCH"],
    ["signature mismatch", new File(["not-a-pdf"], "document.pdf", { type: "application/pdf" }), "SIGNATURE_MISMATCH"],
    ["empty file", new File([], "document.pdf", { type: "application/pdf" }), "FILE_TOO_LARGE"],
    ["oversized file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "document.pdf", { type: "application/pdf" }), "FILE_TOO_LARGE"],
  ])("rejects a %s before storage", async (_name, file, code) => {
    await expect(validateUpload(file)).rejects.toMatchObject({ code });
  });

  it("writes a validated file under a private generated path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "horeca-private-"));
    temporaryRoots.push(root);
    vi.stubEnv("PRIVATE_STORAGE_ROOT", root);
    const validated = await validateUpload(
      new File(["%PDF-private"], "../supplier.pdf", { type: "application/pdf" }),
    );

    const stored = await savePrivateUpload("company-1", validated);

    expect(stored.absolutePath).toBe(resolvePrivatePath(stored.relativePath));
    expect(stored.relativePath).toMatch(/^company-documents\/company-1\/[0-9a-f-]+\.pdf$/);
    await expect(readFile(stored.absolutePath, "utf8")).resolves.toBe("%PDF-private");
    expect((await stat(stored.absolutePath)).mode & 0o777).toBe(0o600);
  });

  it("rejects unsafe company identifiers and traversal paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "horeca-private-"));
    temporaryRoots.push(root);
    vi.stubEnv("PRIVATE_STORAGE_ROOT", root);

    await expect(savePrivateUpload("../other-company", upload)).rejects.toMatchObject({
      code: "INVALID_COMPANY_ID",
    });
    expect(() => resolvePrivatePath("../outside.pdf")).toThrowError(/Небезопасный путь/);
  });
});

describe("malware scanning", () => {
  it("keeps the deterministic mock scanner limited to test environments", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("MALWARE_SCAN_MODE", "mock");

    await expect(antivirusCheck(upload)).resolves.toBe("CLEAN");
  });

  it("sends only the validated bytes and safe metadata to the HTTPS scanner", async () => {
    remoteScannerEnvironment();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ verdict: "clean" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(antivirusCheck(upload)).resolves.toBe("CLEAN");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("https://scanner.example.kz/v1/scan");
    expect(init.method).toBe("POST");
    expect(Buffer.from(init.body as ArrayBuffer)).toEqual(upload.buffer);
    expect(headers.get("authorization")).toBe("Bearer scanner-token-that-must-never-leak");
    expect(headers.get("content-type")).toBe("application/pdf");
    expect(headers.get("x-content-sha256")).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(init)).not.toContain(upload.originalName);
  });

  it("maps an infected verdict to the existing suspicious-file boundary", async () => {
    remoteScannerEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ verdict: "infected", signature: "Eicar-Test-Signature" }),
      ),
    );

    await expect(antivirusCheck(upload)).resolves.toBe("SUSPICIOUS");
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("scanner-token-that-must-never-leak"))],
    ["HTTP failure", () => Promise.resolve(new Response("unavailable", { status: 503 }))],
    ["non-JSON response", () => Promise.resolve(new Response("not-json"))],
    ["malformed verdict", () => Promise.resolve(Response.json({ verdict: "maybe" }))],
  ])("fails closed on %s without leaking backend details", async (_name, response) => {
    remoteScannerEnvironment();
    vi.stubGlobal("fetch", vi.fn(response));

    let error: unknown;
    try {
      await antivirusCheck(upload);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ status: 503, code: "MALWARE_SCAN_UNAVAILABLE" });
    expect(String(error)).not.toContain("scanner-token-that-must-never-leak");
  });

  it.each([
    ["an HTTP endpoint", "MALWARE_SCAN_BACKEND_URL", "http://scanner.example.kz/v1/scan"],
    ["credentials in the endpoint", "MALWARE_SCAN_BACKEND_URL", "https://user:password@scanner.example.kz/v1/scan"],
    ["a short token", "MALWARE_SCAN_BACKEND_TOKEN", "short"],
    ["an unbounded timeout", "MALWARE_SCAN_TIMEOUT_MS", "60001"],
  ])("fails closed with %s", async (_name, variable, value) => {
    remoteScannerEnvironment();
    vi.stubEnv(variable, value);

    await expect(antivirusCheck(upload)).rejects.toMatchObject({
      status: 503,
      code: "MALWARE_SCAN_UNAVAILABLE",
    });
  });

  it("never permits the mock scanner in staging or production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("MALWARE_SCAN_MODE", "mock");

    await expect(antivirusCheck(upload)).rejects.toMatchObject({
      status: 503,
      code: "MALWARE_SCAN_UNAVAILABLE",
    });
  });
});
