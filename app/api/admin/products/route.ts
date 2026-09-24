import type { ProductStatus } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { listAdminProducts } from "@/lib/services/admin";
import { productSchema } from "@/lib/validation";
import { adminCreateProduct } from "@/lib/services/products";

const adminProductCreateSchema = productSchema.extend({ companyId: z.string().min(1) });

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireRole("ADMIN");
    const url = new URL(request.url);
    return ok(
      await listAdminProducts({
        search: url.searchParams.get("search") ?? undefined,
        status: (url.searchParams.get("status") as ProductStatus | null) ?? undefined,
        companyId: url.searchParams.get("companyId") ?? undefined,
        categoryId: url.searchParams.get("categoryId") ?? undefined,
      }),
    );
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { companyId, ...input } = await parseJson(request, adminProductCreateSchema);
    return ok(await adminCreateProduct(companyId, input, admin.id, clientMeta(request)), { status: 201 });
  });
}

