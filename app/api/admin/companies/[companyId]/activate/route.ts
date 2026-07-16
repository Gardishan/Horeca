import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok } from "@/lib/http";
import { activateCompany } from "@/lib/services/verification";

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { companyId } = await context.params;
    return ok(await activateCompany(companyId, admin.id, clientMeta(request)));
  });
}

