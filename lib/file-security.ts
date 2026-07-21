import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AntivirusStatus } from "@prisma/client";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { AppError } from "@/lib/errors";

const malwareVerdictSchema = z.object({
  verdict: z.enum(["clean", "infected"]),
  signature: z.string().max(512).optional(),
}).strict();

type MalwareScanMode = "mock" | "remote";

function malwareScanUnavailable() {
  return new AppError(
    "Проверка файла временно недоступна",
    503,
    "MALWARE_SCAN_UNAVAILABLE",
  );
}

function isDeployedEnvironment() {
  return (
    process.env.APP_ENV === "staging" ||
    process.env.APP_ENV === "production" ||
    (!process.env.APP_ENV && process.env.NODE_ENV === "production")
  );
}

function malwareScanMode(): MalwareScanMode {
  const mode = process.env.MALWARE_SCAN_MODE;
  if (mode === "remote") return mode;
  if ((mode === "mock" || !mode) && !isDeployedEnvironment()) return "mock";
  throw malwareScanUnavailable();
}

function remoteScannerConfiguration() {
  const endpoint = process.env.MALWARE_SCAN_BACKEND_URL;
  const token = process.env.MALWARE_SCAN_BACKEND_TOKEN;
  const timeoutMs = Number(process.env.MALWARE_SCAN_TIMEOUT_MS);

  let url: URL;
  try {
    url = new URL(endpoint ?? "");
  } catch {
    throw malwareScanUnavailable();
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !token ||
    token.length < 32 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 60_000
  ) {
    throw malwareScanUnavailable();
  }

  return { endpoint: url.toString(), token, timeoutMs };
}

async function scanRemote(file: ValidatedUpload): Promise<AntivirusStatus> {
  const { endpoint, token, timeoutMs } = remoteScannerConfiguration();
  const body = file.buffer.buffer.slice(
    file.buffer.byteOffset,
    file.buffer.byteOffset + file.buffer.byteLength,
  ) as ArrayBuffer;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.mimeType,
        "X-Content-Sha256": createHash("sha256").update(file.buffer).digest("hex"),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw malwareScanUnavailable();
  }

  if (!response.ok) throw malwareScanUnavailable();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw malwareScanUnavailable();
  }

  const parsed = malwareVerdictSchema.safeParse(payload);
  if (!parsed.success) throw malwareScanUnavailable();
  return parsed.data.verdict === "clean" ? "CLEAN" : "SUSPICIOUS";
}

const ALLOWED_TYPES = new Map([
  [".pdf", new Set(["application/pdf"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".png", new Set(["image/png"])],
  [".doc", new Set(["application/msword", "application/octet-stream"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"])],
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".js", ".mjs", ".cjs", ".sh", ".bat", ".cmd", ".msi", ".apk", ".dmg", ".html", ".htm", ".svg",
]);

function hasSignature(buffer: Buffer, extension: string) {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === ".png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === ".docx") return buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (extension === ".doc") {
    return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  return false;
}

export type ValidatedUpload = {
  originalName: string;
  storedName: string;
  extension: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export async function validateUpload(file: File): Promise<ValidatedUpload> {
  const originalName = path.basename(file.name).normalize("NFKC");
  const extension = path.extname(originalName).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(extension) || !ALLOWED_TYPES.has(extension)) {
    throw new AppError("Разрешены только PDF, JPG, JPEG, PNG, DOC и DOCX", 415, "FILE_TYPE_REJECTED");
  }
  if (!ALLOWED_TYPES.get(extension)?.has(file.type.toLowerCase())) {
    throw new AppError("MIME-тип файла не соответствует расширению", 415, "MIME_MISMATCH");
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new AppError("Размер файла должен быть от 1 байта до 10 МБ", 413, "FILE_TOO_LARGE");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasSignature(buffer, extension)) {
    throw new AppError("Содержимое файла не соответствует заявленному формату", 415, "SIGNATURE_MISMATCH");
  }

  return {
    originalName,
    storedName: `${randomUUID()}${extension}`,
    extension,
    mimeType: file.type.toLowerCase(),
    size: file.size,
    buffer,
  };
}

export async function antivirusCheck(file: ValidatedUpload): Promise<AntivirusStatus> {
  if (malwareScanMode() === "remote") return scanRemote(file);
  return process.env.NODE_ENV === "test" ? "CLEAN" : "SKIPPED_MOCK";
}

export async function savePrivateUpload(companyId: string, file: ValidatedUpload) {
  if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) {
    throw new AppError("Некорректный идентификатор компании", 400, "INVALID_COMPANY_ID");
  }
  const root = path.resolve(/* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_ROOT ?? "./storage/private");
  const directory = path.resolve(root, "company-documents", companyId);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new AppError("Небезопасный путь хранения", 400, "UNSAFE_STORAGE_PATH");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const absolutePath = path.join(directory, file.storedName);
  await writeFile(absolutePath, file.buffer, { mode: 0o600, flag: "wx" });
  return { absolutePath, relativePath: path.relative(root, absolutePath) };
}

export function resolvePrivatePath(relativePath: string) {
  const root = path.resolve(/* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_ROOT ?? "./storage/private");
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new AppError("Небезопасный путь документа", 400, "UNSAFE_STORAGE_PATH");
  }
  return absolutePath;
}
