import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";
import { submitCompanyVerification } from "@/lib/services/verification";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    return ok(await submitCompanyVerification(company.id));
  });
}

