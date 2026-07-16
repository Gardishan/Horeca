import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { setCompanyProductStatus } from "@/lib/services/products";

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    await requireRole("ADMIN");
    const { productId } = await context.params;
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { companyId: true } });
    if (!product) throw new NotFoundError("Товар не найден");
    return ok(await setCompanyProductStatus(product.companyId, productId, "BLOCKED"));
  });
}

