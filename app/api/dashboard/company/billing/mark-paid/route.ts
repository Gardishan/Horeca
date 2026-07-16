import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { markPaidSchema } from "@/lib/validation";
import { markInvoicePaid } from "@/lib/services/billing";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const input = await parseJson(request, markPaidSchema);
    return ok(await markInvoicePaid(company.id, input.invoiceId));
  });
}

