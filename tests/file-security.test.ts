import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ValidatedUpload } from "@/lib/file-security";

vi.mock("server-only", () => ({}));

const {
  antivirusCheck,
  readPrivateUpload,
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

function s3StorageEnvironment() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("PRIVATE_STORAGE_MODE", "s3");
  vi.stubEnv("PRIVATE_STORAGE_S3_ENDPOINT", "https://s3.example.kz");
  vi.stubEnv("PRIVATE_STORAGE_S3_REGION", "kz-1");
  vi.stubEnv("PRIVATE_STORAGE_S3_BUCKET", "horeca-private-production");
  vi.stubEnv("PRIVATE_STORAGE_S3_FORCE_PATH_STYLE", "true");
  vi.stubEnv("PRIVATE_STORAGE_S3_SSE", "AES256");
  vi.stubEnv("PRIVATE_STORAGE_S3_KMS_KEY_ID", "");
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
    vi.stubEnv("PRIVATE_STORAGE_MODE", "filesystem");
    vi.stubEnv("PRIVATE_STORAGE_ROOT", root);
    const validated = await validateUpload(
      new File(["%PDF-private"], "../supplier.pdf", { type: "application/pdf" }),
    );

    const stored = await savePrivateUpload("company-1", validated);

    expect(stored.absolutePath).toBe(resolvePrivatePath(stored.relativePath));
    expect(stored.relativePath).toMatch(/^company-documents\/company-1\/[0-9a-f-]+\.pdf$/);
    if (!stored.absolutePath) throw new Error("Filesystem storage did not return an absolute path");
    await expect(readFile(stored.absolutePath, "utf8")).resolves.toBe("%PDF-private");
    await expect(readPrivateUpload(stored.relativePath)).resolves.toEqual(validated.buffer);
    expect((await stat(stored.absolutePath)).mode & 0o777).toBe(0o600);

    await expect(
      readPrivateUpload("company-documents/company-1/missing.pdf"),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("rejects unsafe company identifiers and traversal paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "horeca-private-"));
    temporaryRoots.push(root);
    vi.stubEnv("PRIVATE_STORAGE_MODE", "filesystem");
    vi.stubEnv("PRIVATE_STORAGE_ROOT", root);

    await expect(savePrivateUpload("../other-company", upload)).rejects.toMatchObject({
      code: "INVALID_COMPANY_ID",
    });
    expect(() => resolvePrivatePath("../outside.pdf")).toThrowError(/Небезопасный путь/);
  });

  it("stores and reads a private object through the configured S3 boundary", async () => {
    s3StorageEnvironment();
    const send = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ContentLength: upload.buffer.length,
        Body: { transformToByteArray: vi.fn().mockResolvedValue(upload.buffer) },
      });
    const dependencies = { s3Client: { send } as unknown as Pick<S3Client, "send"> };

    const stored = await savePrivateUpload("company-1", upload, dependencies);
    const content = await readPrivateUpload(stored.relativePath, dependencies);

    expect(stored).toEqual({
      relativePath: "company-documents/company-1/generated-id.pdf",
    });
    const put = send.mock.calls[0]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input).toMatchObject({
      Bucket: "horeca-private-production",
      Key: stored.relativePath,
      Body: upload.buffer,
      ContentLength: upload.buffer.length,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    });
    const get = send.mock.calls[1]?.[0];
    expect(get).toBeInstanceOf(GetObjectCommand);
    expect((get as GetObjectCommand).input).toEqual({
      Bucket: "horeca-private-production",
      Key: stored.relativePath,
    });
    expect(content).toEqual(upload.buffer);
  });

  it("passes an explicit KMS key only when KMS encryption is selected", async () => {
    s3StorageEnvironment();
    vi.stubEnv("PRIVATE_STORAGE_S3_FORCE_PATH_STYLE", "false");
    vi.stubEnv("PRIVATE_STORAGE_S3_SSE", "aws:kms");
    vi.stubEnv("PRIVATE_STORAGE_S3_KMS_KEY_ID", "kms-key-reference");
    const send = vi.fn().mockResolvedValue({});

    await savePrivateUpload("company-1", upload, {
      s3Client: { send } as unknown as Pick<S3Client, "send">,
    });

    expect((send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "kms-key-reference",
    });
  });

  it("fails closed before an SDK call when S3 configuration is invalid", async () => {
    s3StorageEnvironment();
    vi.stubEnv("PRIVATE_STORAGE_S3_ENDPOINT", "not-a-url");
    const send = vi.fn();

    await expect(savePrivateUpload("company-1", upload, {
      s3Client: { send } as unknown as Pick<S3Client, "send">,
    })).rejects.toMatchObject({ status: 503, code: "PRIVATE_STORAGE_UNAVAILABLE" });
    expect(send).not.toHaveBeenCalled();
  });

  it("maps a provider-confirmed missing object to a safe not-found response", async () => {
    s3StorageEnvironment();
    const dependencies = {
      s3Client: {
        send: vi.fn().mockRejectedValue({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }),
      } as unknown as Pick<S3Client, "send">,
    };

    await expect(
      readPrivateUpload("company-documents/company-1/missing.pdf", dependencies),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it.each([
    ["backend error", () => Promise.reject(new Error("secret access key must not leak"))],
    ["missing body", () => Promise.resolve({ ContentLength: 1 })],
    ["empty object", () => Promise.resolve({
      ContentLength: 0,
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array()) },
    })],
    ["truncated body", () => Promise.resolve({
      ContentLength: 2,
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1])) },
    })],
    ["oversized object", () => Promise.resolve({ ContentLength: 10 * 1024 * 1024 + 1 })],
    ["stream failure", () => Promise.resolve({
      ContentLength: 1,
      Body: { transformToByteArray: () => Promise.reject(new Error("secret stream failure")) },
    })],
    ["oversized streamed body", () => Promise.resolve({
      Body: {
        transformToByteArray: () => Promise.resolve(new Uint8Array(10 * 1024 * 1024 + 1)),
      },
    })],
  ])("fails closed when S3 returns %s", async (_name, result) => {
    s3StorageEnvironment();
    const dependencies = {
      s3Client: { send: vi.fn(result) } as unknown as Pick<S3Client, "send">,
    };

    let error: unknown;
    try {
      await readPrivateUpload("company-documents/company-1/generated-id.pdf", dependencies);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ status: 503, code: "PRIVATE_STORAGE_UNAVAILABLE" });
    expect(String(error)).not.toContain("secret access key");
  });

  it("never permits filesystem storage in staging or production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("PRIVATE_STORAGE_MODE", "filesystem");
    vi.stubEnv("PRIVATE_STORAGE_ROOT", "/var/lib/horeca/private");

    await expect(savePrivateUpload("company-1", upload)).rejects.toMatchObject({
      status: 503,
      code: "PRIVATE_STORAGE_UNAVAILABLE",
    });
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
