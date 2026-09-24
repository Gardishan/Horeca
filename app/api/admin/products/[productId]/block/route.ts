import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok } from "@/lib/http";
import { adminSetProductStatus } from "@/lib/services/products";

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { productId } = await context.params;
    return ok(await adminSetProductStatus(productId, "BLOCKED", admin.id, clientMeta(request)));
  });
}
