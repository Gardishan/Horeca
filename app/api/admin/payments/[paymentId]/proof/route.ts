import path from "node:path";
import { requireRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { readPrivateUpload } from "@/lib/file-security";
import { apiHandler, clientMeta } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/services/audit";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  return apiHandler(async () => {
    const admin = await requireRole("ADMIN");
    const { paymentId } = await context.params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, companyId: true, proofFilePath: true },
    });
    if (!payment?.proofFilePath) throw new NotFoundError("Подтверждение оплаты не найдено");

    const content = await readPrivateUpload(payment.proofFilePath);
    await writeAuditLog({
      adminUserId: admin.id,
      companyId: payment.companyId,
      action: "PAYMENT_PROOF_DOWNLOADED",
      entityType: "Payment",
      entityId: payment.id,
      ...clientMeta(request),
    });

    const extension = path.extname(payment.proofFilePath).toLowerCase();
    const body = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Content-Length": String(content.length),
        "Content-Disposition": `attachment; filename="payment-proof${extension}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
