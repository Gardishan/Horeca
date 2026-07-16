import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { buyerRequestSchema } from "@/lib/validation";
import { assertRateLimit } from "@/lib/rate-limit";
import { createBuyerRequest } from "@/lib/services/catalog";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const meta = clientMeta(request);
    await assertRateLimit(`buyer-request:${meta.ipAddress ?? "unknown"}`, 8, 60 * 60 * 1000);
    const input = await parseJson(request, buyerRequestSchema);
    const { website, ...data } = input;
    void website;
    return ok(await createBuyerRequest(data), { status: 201 });
  });
}
