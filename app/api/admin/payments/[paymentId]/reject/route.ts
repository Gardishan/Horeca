import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { adminDecisionSchema } from "@/lib/validation";
import { rejectPayment } from "@/lib/services/billing";

export async function POST(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { paymentId } = await context.params;
    const { comment } = await parseJson(request, adminDecisionSchema);
    return ok(await rejectPayment(paymentId, admin.id, comment, clientMeta(request)));
  });
}

