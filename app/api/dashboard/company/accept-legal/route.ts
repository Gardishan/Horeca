import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { legalAcceptanceSchema } from "@/lib/validation";
import { acceptLegal } from "@/lib/services/verification";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { user, company } = await requireSupplierCompany();
    const input = await parseJson(request, legalAcceptanceSchema);
    return ok(await acceptLegal(company.id, user.id, input.type, clientMeta(request)), { status: 201 });
  });
}

