import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { adminDecisionSchema } from "@/lib/validation";
import { decideVerification } from "@/lib/services/verification";

export async function POST(request: Request, context: { params: Promise<{ verificationId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { verificationId } = await context.params;
    const { comment } = await parseJson(request, adminDecisionSchema);
    return ok(await decideVerification(verificationId, "REJECTED", admin.id, comment, clientMeta(request)));
  });
}

