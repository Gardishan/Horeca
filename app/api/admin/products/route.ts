import type { ProductStatus } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok, parseJson } from "@/lib/http";
import { listAdminProducts } from "@/lib/services/admin";
import { productSchema } from "@/lib/validation";
import { createCompanyProduct } from "@/lib/services/products";

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
    await requireRole("ADMIN");
    const { companyId, ...input } = await parseJson(request, adminProductCreateSchema);
    return ok(await createCompanyProduct(companyId, input), { status: 201 });
  });
}

