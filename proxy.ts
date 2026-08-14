import { type NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy, createCspNonce } from "@/lib/web-security";
import {
  BETA_ACCESS_COOKIE,
  evaluateBetaRequest,
} from "@/lib/beta-safety";

function betaUnavailable(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex, nofollow" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: { code: "BETA_DISABLED", message: "Контролируемая Beta временно выключена" } },
      { status: 503, headers },
    );
  }
  return new NextResponse("Контролируемая Beta временно выключена.", { status: 503, headers });
}

function isPrivatePath(pathname: string) {
  return ["/admin", "/dashboard", "/login", "/register", "/beta-access"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const betaDecision = evaluateBetaRequest({
    pathname,
    cookieValue: request.cookies.get(BETA_ACCESS_COOKIE)?.value,
  });
  if (betaDecision === "unavailable") return betaUnavailable(request);
  if (betaDecision === "unauthorized") {
    return NextResponse.json(
      { ok: false, error: { code: "BETA_ACCESS_REQUIRED", message: "Требуется доступ к контролируемой Beta" } },
      { status: 401, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }
  if (betaDecision === "redirect") {
    const accessUrl = request.nextUrl.clone();
    accessUrl.pathname = "/beta-access";
    accessUrl.search = new URLSearchParams({ next: `${pathname}${request.nextUrl.search}` }).toString();
    return NextResponse.redirect(accessUrl);
  }

  if (pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const nonce = createCspNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (process.env.APP_ENV === "beta" || isPrivatePath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
