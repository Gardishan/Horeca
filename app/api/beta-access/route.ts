import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { AppError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { betaAccessSchema } from "@/lib/validation";
import {
  BETA_ACCESS_COOKIE,
  BETA_ACCESS_MAX_AGE_SECONDS,
  createBetaAccessCookieValue,
  isBetaEnvironment,
  verifyBetaAccessToken,
} from "@/lib/beta-safety";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    if (!isBetaEnvironment()) throw new NotFoundError();
    if (process.env.BETA_ENABLED !== "true") {
      throw new AppError("Контролируемая Beta временно выключена", 503, "BETA_DISABLED");
    }

    const meta = clientMeta(request);
    await assertRateLimit(`beta-access:${meta.ipAddress ?? "unknown"}`, 10, 15 * 60 * 1000);
    const input = await parseJson(request, betaAccessSchema);
    if (!verifyBetaAccessToken(input.accessToken)) {
      throw new UnauthorizedError("Неверный код доступа");
    }

    const response = ok({ access: "granted" as const });
    response.cookies.set(BETA_ACCESS_COOKIE, createBetaAccessCookieValue(), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: BETA_ACCESS_MAX_AGE_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  });
}
