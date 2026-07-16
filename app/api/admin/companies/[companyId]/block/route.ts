import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { adminDecisionSchema } from "@/lib/validation";
import { blockCompany } from "@/lib/services/verification";

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { companyId } = await context.params;
    const { comment } = await parseJson(request, adminDecisionSchema);
    return ok(await blockCompany(companyId, admin.id, comment, clientMeta(request)));
  });
}

