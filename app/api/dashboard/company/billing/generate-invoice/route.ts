import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";
import { generateInvoice } from "@/lib/services/billing";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    return ok(await generateInvoice(company.id), { status: 201 });
  });
}

