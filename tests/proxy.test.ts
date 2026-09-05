import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";
import { BETA_ACCESS_COOKIE, createBetaAccessCookieValue } from "@/lib/beta-safety";

const BETA_SECRETS = {
  AUTH_SECRET: "beta-cookie-secret-with-at-least-thirty-two-characters",
  BETA_ACCESS_TOKEN: "beta-access-token-with-at-least-thirty-two-characters",
} as const;

// Классы запросов, которые App Router отправляет на тот же путь страницы.
// Каждый из них обязан проходить через прокси: именно там живёт весь гейт Beta.
const navigationHeaders = [
  ["plain navigation", {}],
  ["next-router-prefetch", { "next-router-prefetch": "1" }],
  ["purpose=prefetch", { purpose: "prefetch" }],
  ["RSC navigation", { RSC: "1" }],
  ["RSC prefetch", { RSC: "1", "Next-Router-Prefetch": "1" }],
] as const;

const prefetchHeaders = [
  ["next-router-prefetch", { "next-router-prefetch": "1" }],
  ["purpose=prefetch", { purpose: "prefetch" }],
] as const;

function enableBeta(enabled = "true") {
  vi.stubEnv("APP_ENV", "beta");
  vi.stubEnv("BETA_ENABLED", enabled);
  vi.stubEnv("AUTH_SECRET", BETA_SECRETS.AUTH_SECRET);
  vi.stubEnv("BETA_ACCESS_TOKEN", BETA_SECRETS.BETA_ACCESS_TOKEN);
}

function requestWith(url: string, headers: Record<string, string>, cookie?: string) {
  return new NextRequest(url, {
    headers: cookie ? { ...headers, cookie: `${BETA_ACCESS_COOKIE}=${cookie}` } : headers,
  });
}

describe("controlled Beta proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(prefetchHeaders)(
    "does not let %s bypass the disabled-Beta gate",
    async (_label, headers) => {
      vi.stubEnv("APP_ENV", "beta");
      vi.stubEnv("BETA_ENABLED", "false");
      const url = "https://beta.horeca.example/catalog";

      expect(
        unstable_doesMiddlewareMatch({
          config,
          url,
          headers,
        }),
      ).toBe(true);

      const response = proxy(new NextRequest(url, { headers }));

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).toContain("Beta временно выключена");
    },
  );

  it.each(prefetchHeaders)(
    "does not let %s bypass the invite gate",
    (_label, headers) => {
      vi.stubEnv("APP_ENV", "beta");
      vi.stubEnv("BETA_ENABLED", "true");
      const url = "https://beta.horeca.example/catalog?city=almaty";

      expect(
        unstable_doesMiddlewareMatch({
          config,
          url,
          headers,
        }),
      ).toBe(true);

      const response = proxy(new NextRequest(url, { headers }));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://beta.horeca.example/beta-access?next=%2Fcatalog%3Fcity%3Dalmaty",
      );
    },
  );

  it.each(navigationHeaders)(
    "routes %s through the gate instead of around it",
    (_label, headers) => {
      enableBeta();
      const url = "https://beta.horeca.example/dashboard/company";

      expect(unstable_doesMiddlewareMatch({ config, url, headers })).toBe(true);
      expect(proxy(requestWith(url, headers)).status).toBe(307);
    },
  );

  it.each(navigationHeaders)(
    "keeps the kill switch closed for %s even with a previously valid access cookie",
    (_label, headers) => {
      enableBeta();
      const cookie = createBetaAccessCookieValue();
      const url = "https://beta.horeca.example/dashboard/company";

      // Кука действительна: при включённой Beta тот же запрос проходит.
      expect(proxy(requestWith(url, headers, cookie)).status).toBe(200);

      vi.stubEnv("BETA_ENABLED", "false");
      const response = proxy(requestWith(url, headers, cookie));

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    },
  );

  it.each(navigationHeaders)(
    "serves authorised %s with the controlled-Beta response headers",
    (_label, headers) => {
      enableBeta();
      const url = "https://beta.horeca.example/catalog";
      const response = proxy(requestWith(url, headers, createBetaAccessCookieValue()));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toMatch(/'nonce-.+'/);
      expect(response.headers.get("Content-Security-Policy")).not.toContain("'unsafe-inline'");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    },
  );

  it.each(prefetchHeaders)(
    "answers an unauthorised API request carrying %s with the 401 envelope",
    async (_label, headers) => {
      enableBeta();
      const url = "https://beta.horeca.example/api/catalog/products";

      expect(unstable_doesMiddlewareMatch({ config, url, headers })).toBe(true);

      const response = proxy(requestWith(url, headers));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: "BETA_ACCESS_REQUIRED", message: "Требуется доступ к контролируемой Beta" },
      });
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    },
  );

  it("answers a disabled Beta API request with the 503 envelope rather than HTML", async () => {
    enableBeta("false");
    const response = proxy(
      requestWith("https://beta.horeca.example/api/catalog/products", {}),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "BETA_DISABLED", message: "Контролируемая Beta временно выключена" },
    });
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("keeps the health and access exceptions reachable without a cookie", () => {
    enableBeta();

    for (const pathname of ["/api/health/live", "/api/health/ready", "/beta-access", "/api/beta-access"]) {
      const response = proxy(requestWith(`https://beta.horeca.example${pathname}`, {}));
      expect(response.status, pathname).toBe(200);
    }

    // Kill switch не должен закрывать liveness: оператору нужно видеть, что процесс жив.
    vi.stubEnv("BETA_ENABLED", "false");
    expect(proxy(requestWith("https://beta.horeca.example/api/health/live", {})).status).toBe(200);
  });

  it("leaves static assets outside the matcher", () => {
    enableBeta();

    for (const url of [
      "https://beta.horeca.example/_next/static/chunks/main.js",
      "https://beta.horeca.example/favicon.ico",
      "https://beta.horeca.example/robots.txt",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }

    // Всё остальное под /_next остаётся под гейтом, включая flight-данные.
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "https://beta.horeca.example/_next/data/build/catalog.json",
      }),
    ).toBe(true);
  });

  it("does not gate a non-beta environment but still sets the page CSP on prefetch", () => {
    vi.stubEnv("APP_ENV", "production");
    const response = proxy(
      requestWith("https://horeca.example/catalog", { "next-router-prefetch": "1" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toMatch(/'nonce-.+'/);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});
