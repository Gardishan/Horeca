import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

const prefetchHeaders = [
  ["next-router-prefetch", { "next-router-prefetch": "1" }],
  ["purpose=prefetch", { purpose: "prefetch" }],
] as const;

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
});
