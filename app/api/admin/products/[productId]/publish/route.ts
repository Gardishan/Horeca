import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok } from "@/lib/http";
import { adminPublishProduct } from "@/lib/services/products";

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { productId } = await context.params;
    return ok(await adminPublishProduct(productId, admin.id, clientMeta(request)));
  });
}
