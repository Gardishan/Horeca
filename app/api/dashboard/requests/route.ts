import { apiHandler, ok } from "@/lib/http";
import { listSupplierBuyerRequests } from "@/lib/services/buyer-requests";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const page = new URL(request.url).searchParams.get("page") ?? undefined;
    return ok(await listSupplierBuyerRequests(page), {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
