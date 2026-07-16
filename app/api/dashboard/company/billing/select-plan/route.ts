import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { planSelectionSchema } from "@/lib/validation";
import { selectPlan } from "@/lib/services/billing";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const input = await parseJson(request, planSelectionSchema);
    return ok(await selectPlan(company.id, input.planCode), { status: 201 });
  });
}

