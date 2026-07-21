import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type ServerSideEncryption,
} from "@aws-sdk/client-s3";
import { AntivirusStatus } from "@prisma/client";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { AppError, NotFoundError } from "@/lib/errors";

const malwareVerdictSchema = z.object({
  verdict: z.enum(["clean", "infected"]),
  signature: z.string().max(512).optional(),
}).strict();

type MalwareScanMode = "mock" | "remote";
type PrivateStorageMode = "filesystem" | "s3";
type PrivateStorageDependencies = {
  s3Client?: Pick<S3Client, "send">;
};

type S3StorageConfiguration = {
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  serverSideEncryption: ServerSideEncryption;
  kmsKeyId?: string;
};

let cachedS3Client: S3Client | undefined;

function malwareScanUnavailable() {
  return new AppError(
    "Проверка файла временно недоступна",
    503,
    "MALWARE_SCAN_UNAVAILABLE",
  );
}

function privateStorageUnavailable() {
  return new AppError(
    "Приватное хранилище временно недоступно",
    503,
    "PRIVATE_STORAGE_UNAVAILABLE",
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

function privateStorageMode(): PrivateStorageMode {
  const mode = process.env.PRIVATE_STORAGE_MODE;
  if (mode === "s3") return mode;
  if ((mode === "filesystem" || !mode) && !isDeployedEnvironment()) return "filesystem";
  throw privateStorageUnavailable();
}

function isValidBucketName(bucket: string) {
  return (
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
    !bucket.includes("..") &&
    !bucket.includes(".-") &&
    !bucket.includes("-.") &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)
  );
}

function s3StorageConfiguration(): S3StorageConfiguration {
  const endpoint = process.env.PRIVATE_STORAGE_S3_ENDPOINT;
  const region = process.env.PRIVATE_STORAGE_S3_REGION?.trim();
  const bucket = process.env.PRIVATE_STORAGE_S3_BUCKET?.trim();
  const forcePathStyle = process.env.PRIVATE_STORAGE_S3_FORCE_PATH_STYLE;
  const encryption = process.env.PRIVATE_STORAGE_S3_SSE;
  const kmsKeyId = process.env.PRIVATE_STORAGE_S3_KMS_KEY_ID?.trim();

  let url: URL;
  try {
    url = new URL(endpoint ?? "");
  } catch {
    throw privateStorageUnavailable();
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !region ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(region) ||
    !bucket ||
    !isValidBucketName(bucket) ||
    !["true", "false"].includes(forcePathStyle ?? "") ||
    !["AES256", "aws:kms"].includes(encryption ?? "") ||
    (encryption === "aws:kms" && !kmsKeyId) ||
    (encryption === "AES256" && Boolean(kmsKeyId))
  ) {
    throw privateStorageUnavailable();
  }

  return {
    endpoint: url.origin,
    region,
    bucket,
    forcePathStyle: forcePathStyle === "true",
    serverSideEncryption: encryption as ServerSideEncryption,
    ...(kmsKeyId ? { kmsKeyId } : {}),
  };
}

function s3Client(
  configuration: S3StorageConfiguration,
  dependencies: PrivateStorageDependencies,
) {
  if (dependencies.s3Client) return dependencies.s3Client;
  cachedS3Client ??= new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: configuration.forcePathStyle,
  });
  return cachedS3Client;
}

function privateObjectKey(companyId: string, storedName: string) {
  return `company-documents/${companyId}/${storedName}`;
}

function assertSafeStorageKey(storagePath: string) {
  if (
    storagePath.length > 1_024 ||
    !/^company-documents\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(storagePath)
  ) {
    throw new AppError("Небезопасный путь документа", 400, "UNSAFE_STORAGE_PATH");
  }
  return storagePath;
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404;
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

export async function savePrivateUpload(
  companyId: string,
  file: ValidatedUpload,
  dependencies: PrivateStorageDependencies = {},
): Promise<{ relativePath: string; absolutePath?: string }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) {
    throw new AppError("Некорректный идентификатор компании", 400, "INVALID_COMPANY_ID");
  }
  const relativePath = assertSafeStorageKey(privateObjectKey(companyId, file.storedName));

  if (privateStorageMode() === "s3") {
    const configuration = s3StorageConfiguration();
    try {
      await s3Client(configuration, dependencies).send(new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: relativePath,
        Body: file.buffer,
        ContentLength: file.buffer.length,
        ContentType: file.mimeType,
        ServerSideEncryption: configuration.serverSideEncryption,
        ...(configuration.kmsKeyId ? { SSEKMSKeyId: configuration.kmsKeyId } : {}),
      }));
    } catch {
      throw privateStorageUnavailable();
    }
    return { relativePath };
  }

  const root = path.resolve(/* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_ROOT ?? "./storage/private");
  const directory = path.resolve(root, "company-documents", companyId);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new AppError("Небезопасный путь хранения", 400, "UNSAFE_STORAGE_PATH");
  }
  const absolutePath = path.resolve(root, relativePath);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, file.buffer, { mode: 0o600, flag: "wx" });
  } catch {
    throw privateStorageUnavailable();
  }
  return { absolutePath, relativePath };
}

export async function readPrivateUpload(
  storagePath: string,
  dependencies: PrivateStorageDependencies = {},
): Promise<Buffer> {
  const relativePath = assertSafeStorageKey(storagePath);

  if (privateStorageMode() === "filesystem") {
    try {
      return await readFile(resolvePrivatePath(relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new NotFoundError("Файл документа отсутствует в приватном хранилище");
      }
      if (error instanceof AppError) throw error;
      throw privateStorageUnavailable();
    }
  }

  const configuration = s3StorageConfiguration();
  let output: GetObjectCommandOutput;
  try {
    output = await s3Client(configuration, dependencies).send(new GetObjectCommand({
      Bucket: configuration.bucket,
      Key: relativePath,
    })) as GetObjectCommandOutput;
  } catch (error) {
    if (isMissingObject(error)) {
      throw new NotFoundError("Файл документа отсутствует в приватном хранилище");
    }
    throw privateStorageUnavailable();
  }

  const declaredLength = output.ContentLength;
  if (
    !output.Body ||
    (declaredLength !== undefined && (declaredLength <= 0 || declaredLength > MAX_UPLOAD_BYTES))
  ) {
    throw privateStorageUnavailable();
  }

  try {
    const content = Buffer.from(await output.Body.transformToByteArray());
    if (
      content.length <= 0 ||
      content.length > MAX_UPLOAD_BYTES ||
      (declaredLength !== undefined && declaredLength !== content.length)
    ) {
      throw privateStorageUnavailable();
    }
    return content;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw privateStorageUnavailable();
  }
}

export function resolvePrivatePath(relativePath: string) {
  assertSafeStorageKey(relativePath);
  const root = path.resolve(/* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_ROOT ?? "./storage/private");
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new AppError("Небезопасный путь документа", 400, "UNSAFE_STORAGE_PATH");
  }
  return absolutePath;
}
