import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { productSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { updateCompanyProduct } from "@/lib/services/products";

export async function PUT(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    await requireRole("ADMIN");
    const { productId } = await context.params;
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { companyId: true } });
    if (!product) throw new NotFoundError("Товар не найден");
    const input = await parseJson(request, productSchema.partial());
    return ok(await updateCompanyProduct(product.companyId, productId, input));
  });
}

