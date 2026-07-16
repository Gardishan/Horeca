import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rate limiting", () => {
  it("allows requests up to the limit and reports a deterministic retry window", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const key = "vitest-rate-limit-window";

    expect(() => assertRateLimit(key, 2, 2_000)).not.toThrow();
    expect(() => assertRateLimit(key, 2, 2_000)).not.toThrow();

    try {
      assertRateLimit(key, 2, 2_000);
      throw new Error("Expected rate limiter to reject the third request");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        status: 429,
        code: "RATE_LIMITED",
        details: { retryAfterSeconds: 2 },
      });
    }
  });

  it("opens a fresh bucket after the window expires", () => {
    const now = vi.spyOn(Date, "now");
    const key = "vitest-rate-limit-reset";
    now.mockReturnValue(10_000);
    assertRateLimit(key, 1, 500);

    now.mockReturnValue(10_500);
    expect(() => assertRateLimit(key, 1, 500)).not.toThrow();
  });
});
