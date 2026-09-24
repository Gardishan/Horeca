import { apiHandler, ok } from "@/lib/http";
import { listPublicProducts } from "@/lib/services/catalog";
import { catalogQuerySchema } from "@/lib/catalog-query";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const url = new URL(request.url);
    const query = catalogQuerySchema.parse(Object.fromEntries(url.searchParams));
    const data = await listPublicProducts(query);
    return ok(data);
  });
}
