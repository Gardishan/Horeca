import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, ok } from "@/lib/http";
import { getCompanyBilling } from "@/lib/services/billing";

export async function GET() {
  return apiHandler(async () => {
    const { company } = await requireSupplierCompany();
    return ok(await getCompanyBilling(company.id));
  });
}

