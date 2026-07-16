import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { adminDecisionSchema } from "@/lib/validation";
import { decideDocument } from "@/lib/services/verification";

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { documentId } = await context.params;
    const { comment } = await parseJson(request, adminDecisionSchema);
    return ok(await decideDocument(documentId, "APPROVED", admin.id, comment, clientMeta(request)));
  });
}

