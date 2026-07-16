import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { antivirusCheck, savePrivateUpload, validateUpload } from "@/lib/file-security";
import { recordPaymentProof } from "@/lib/services/billing";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const form = await request.formData();
    const file = form.get("file");
    const invoiceId = String(form.get("invoiceId") ?? "");
    if (!(file instanceof File)) throw new AppError("Выберите подтверждение оплаты", 422, "FILE_REQUIRED");
    if (!invoiceId) throw new AppError("Не указан счёт", 422, "INVOICE_REQUIRED");
    const validated = await validateUpload(file);
    const antivirusStatus = await antivirusCheck(validated);
    if (antivirusStatus === "SUSPICIOUS") throw new AppError("Файл не прошёл проверку безопасности", 422, "MALWARE_SUSPECTED");
    const stored = await savePrivateUpload(company.id, validated);
    return ok(await recordPaymentProof(company.id, invoiceId, stored.relativePath));
  });
}

