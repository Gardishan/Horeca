import { readFile } from "node:fs/promises";
import { requireRole } from "@/lib/auth";
import { apiHandler, clientMeta } from "@/lib/http";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolvePrivatePath } from "@/lib/file-security";

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return apiHandler(async () => {
    const admin = await requireRole("ADMIN");
    const { documentId } = await context.params;
    const document = await prisma.companyDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundError("Документ не найден");

    const content = await readFile(resolvePrivatePath(document.storagePath)).catch(() => {
      throw new NotFoundError("Файл документа отсутствует в приватном хранилище");
    });
    await prisma.documentDownloadLog.create({
      data: {
        documentId,
        adminUserId: admin.id,
        companyId: document.companyId,
        ...clientMeta(request),
      },
    });
    return new Response(content, {
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

