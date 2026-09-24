import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";
import { hideCompanyProduct } from "@/lib/services/products";

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const { productId } = await context.params;
    return ok(await hideCompanyProduct(company.id, productId));
  });
}

