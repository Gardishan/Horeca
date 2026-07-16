import { clearSession } from "@/lib/auth";
import { apiHandler, assertSameOrigin, ok } from "@/lib/http";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    await clearSession();
    return ok({ loggedOut: true });
  });
}

