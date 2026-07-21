import { requireRole } from "@/lib/auth";
import { apiHandler, clientMeta } from "@/lib/http";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { readPrivateUpload } from "@/lib/file-security";

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return apiHandler(async () => {
    const admin = await requireRole("ADMIN");
    const { documentId } = await context.params;
    const document = await prisma.companyDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundError("Документ не найден");

    const content = await readPrivateUpload(document.storagePath);
    await prisma.documentDownloadLog.create({
      data: {
        documentId,
        adminUserId: admin.id,
        companyId: document.companyId,
        ...clientMeta(request),
      },
    });
    const body = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(content.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
