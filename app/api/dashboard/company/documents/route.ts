import { DocumentType } from "@prisma/client";
import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";
import { antivirusCheck, savePrivateUpload, validateUpload } from "@/lib/file-security";
import { AppError } from "@/lib/errors";
import { listCompanyDocuments, registerCompanyDocument } from "@/lib/services/verification";

export async function GET() {
  return apiHandler(async () => {
    const { company } = await requireSupplierCompany();
    return ok(await listCompanyDocuments(company.id));
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const form = await request.formData();
    const file = form.get("file");
    const rawType = String(form.get("type") ?? "");
    if (!(file instanceof File)) throw new AppError("Выберите документ", 422, "FILE_REQUIRED");
    if (!Object.values(DocumentType).includes(rawType as DocumentType)) {
      throw new AppError("Некорректный тип документа", 422, "DOCUMENT_TYPE_INVALID");
    }
    const validated = await validateUpload(file);
    const antivirusStatus = await antivirusCheck(validated);
    if (antivirusStatus === "SUSPICIOUS") throw new AppError("Файл не прошёл проверку безопасности", 422, "MALWARE_SUSPECTED");
    const stored = await savePrivateUpload(company.id, validated);
    const document = await registerCompanyDocument({
      companyId: company.id,
      type: rawType as DocumentType,
      originalName: validated.originalName,
      storedName: validated.storedName,
      storagePath: stored.relativePath,
      mimeType: validated.mimeType,
      size: validated.size,
      antivirusStatus,
    });
    return ok(document, { status: 201 });
  });
}

