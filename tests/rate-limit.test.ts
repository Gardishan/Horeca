import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { assertRateLimit, resetRateLimitForTests } from "@/lib/rate-limit";

afterEach(() => {
  resetRateLimitForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("rate limiting", () => {
  it("allows requests up to the memory limit and reports a deterministic retry window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const key = "vitest-rate-limit-window";

    await expect(assertRateLimit(key, 2, 2_000)).resolves.toBeUndefined();
    await expect(assertRateLimit(key, 2, 2_000)).resolves.toBeUndefined();

    await expect(assertRateLimit(key, 2, 2_000)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      details: { retryAfterSeconds: 2 },
    });
  });

  it("opens a fresh memory bucket after the window expires", async () => {
    const now = vi.spyOn(Date, "now");
    const key = "vitest-rate-limit-reset";
    now.mockReturnValue(10_000);
    await assertRateLimit(key, 1, 500);

    now.mockReturnValue(10_500);
    await expect(assertRateLimit(key, 1, 500)).resolves.toBeUndefined();
  });

  it("fails closed in production when no distributed backend is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_MODE", "remote");
    vi.stubEnv("RATE_LIMIT_BACKEND_URL", "");
    vi.stubEnv("RATE_LIMIT_BACKEND_TOKEN", "");

    await expect(assertRateLimit("login:203.0.113.4", 10, 60_000)).rejects.toMatchObject({
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });

  it("uses the HTTPS backend with a hashed key and propagates a denial", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_MODE", "remote");
    vi.stubEnv("RATE_LIMIT_BACKEND_URL", "https://rate-limit.example/consume");
    vi.stubEnv("RATE_LIMIT_BACKEND_TOKEN", "test-only-token");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ allowed: false, retryAfterSeconds: 7 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertRateLimit("login:203.0.113.4", 10, 60_000)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      details: { retryAfterSeconds: 7 },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://rate-limit.example/consume");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-only-token");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ limit: 10, windowMs: 60_000 });
    expect(body.key).not.toBe("login:203.0.113.4");
  });

  it("normalizes an invalid backend response to a safe availability error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_MODE", "remote");
    vi.stubEnv("RATE_LIMIT_BACKEND_URL", "https://rate-limit.example/consume");
    vi.stubEnv("RATE_LIMIT_BACKEND_TOKEN", "test-only-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ allowed: "yes" })));

    try {
      await assertRateLimit("register:203.0.113.4", 5, 60_000);
      throw new Error("Expected an unavailable rate-limit backend to fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 503, code: "RATE_LIMIT_UNAVAILABLE" });
    }
  });
});
