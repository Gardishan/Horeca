import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { companyProfileSchema } from "@/lib/validation";
import { getCompanyDashboard, updateCompanyProfile } from "@/lib/services/dashboard";

export async function GET() {
  return apiHandler(async () => {
    const { company } = await requireSupplierCompany();
    return ok(await getCompanyDashboard(company.id));
  });
}

export async function PUT(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const input = await parseJson(request, companyProfileSchema);
    return ok(await updateCompanyProfile(company.id, input));
  });
}

