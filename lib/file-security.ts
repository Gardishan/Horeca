import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AntivirusStatus } from "@prisma/client";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { AppError } from "@/lib/errors";

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
  // MVP seam: replace with ClamAV or a managed malware scanner before production.
  void file;
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
