import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { productSchema } from "@/lib/validation";
import { adminUpdateProduct } from "@/lib/services/products";

export async function PUT(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { productId } = await context.params;
    const input = await parseJson(request, productSchema.partial());
    return ok(await adminUpdateProduct(productId, input, admin.id, clientMeta(request)));
  });
}
