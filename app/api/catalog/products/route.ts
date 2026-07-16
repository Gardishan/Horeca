import type { AvailabilityStatus } from "@prisma/client";
import { apiHandler, ok } from "@/lib/http";
import { listPublicProducts } from "@/lib/services/catalog";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const url = new URL(request.url);
    const availability = url.searchParams.get("availability") as AvailabilityStatus | null;
    const data = await listPublicProducts({
      search: url.searchParams.get("search") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      supplierType: url.searchParams.get("supplierType") ?? undefined,
      availability: availability ?? undefined,
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 24),
    });
    return ok(data);
  });
}

