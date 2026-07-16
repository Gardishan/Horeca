import { requireSupplierCompany } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { productSchema } from "@/lib/validation";
import { updateCompanyProduct } from "@/lib/services/products";

export async function PUT(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const { company } = await requireSupplierCompany();
    const { productId } = await context.params;
    const input = await parseJson(request, productSchema.partial());
    return ok(await updateCompanyProduct(company.id, productId, input));
  });
}

