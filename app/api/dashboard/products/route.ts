import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { supplierProductSchema } from "@/lib/validation";
import { createCompanyProduct, listCompanyProducts } from "@/lib/services/products";

export async function GET() {
  return apiHandler(async () => {
    const { company } = await requireSupplierCompany();
    return ok(await listCompanyProducts(company.id));
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const input = await parseJson(request, supplierProductSchema);
    return ok(await createCompanyProduct(company.id, input), { status: 201 });
  });
}
