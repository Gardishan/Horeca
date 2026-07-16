import { apiHandler, ok } from "@/lib/http";
import { getPublicProduct } from "@/lib/services/catalog";

export async function GET(_request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    const { productId } = await context.params;
    return ok(await getPublicProduct(productId));
  });
}

