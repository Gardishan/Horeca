import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { apiHandler, assertSameOrigin, clientMeta, parseJson } from "@/lib/http";

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  process.env.APP_URL = originalAppUrl;
  vi.restoreAllMocks();
});

describe("same-origin protection", () => {
  it("accepts the request origin and configured application origin", () => {
    expect(() =>
      assertSameOrigin(new Request("https://horeca.example/api/test", {
        headers: { origin: "https://horeca.example" },
      })),
    ).not.toThrow();

    process.env.APP_URL = "https://admin.horeca.example";
    expect(() =>
      assertSameOrigin(new Request("https://horeca.example/api/test", {
        headers: { origin: "https://admin.horeca.example" },
      })),
    ).not.toThrow();
  });

  it("rejects cross-site metadata and unknown origins", () => {
    expect(() =>
      assertSameOrigin(new Request("https://horeca.example/api/test", {
        headers: { "sec-fetch-site": "cross-site" },
      })),
    ).toThrowError(AppError);

    expect(() =>
      assertSameOrigin(new Request("https://horeca.example/api/test", {
        headers: { origin: "https://attacker.example" },
      })),
    ).toThrowError(/Origin/);
  });

  it("allows requests without a browser Origin header", () => {
    expect(() => assertSameOrigin(new Request("https://horeca.example/api/test"))).not.toThrow();
  });
});

describe("HTTP boundary helpers", () => {
  it("validates JSON and rejects malformed payloads", async () => {
    const schema = z.object({ quantity: z.number().int().positive() });
    await expect(parseJson(new Request("https://horeca.example", {
      method: "POST",
      body: JSON.stringify({ quantity: 3 }),
    }), schema)).resolves.toEqual({ quantity: 3 });

    await expect(parseJson(new Request("https://horeca.example", {
      method: "POST",
      body: "not-json",
    }), schema)).rejects.toMatchObject({ code: "INVALID_JSON", status: 400 });
  });

  it("extracts the first trusted proxy value and user agent", () => {
    expect(clientMeta(new Request("https://horeca.example", {
      headers: {
        "x-forwarded-for": "203.0.113.4, 10.0.0.2",
        "user-agent": "vitest",
      },
    }))).toEqual({ ipAddress: "203.0.113.4", userAgent: "vitest" });
  });

  it("normalizes validation, domain and unexpected errors", async () => {
    const validation = await apiHandler(async () => {
      z.object({ name: z.string().min(2) }).parse({ name: "" });
      return new Response();
    });
    expect(validation.status).toBe(422);
    await expect(validation.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });

    const domain = await apiHandler(async () => {
      throw new AppError("blocked", 409, "BLOCKED", { reason: "test" });
    });
    expect(domain.status).toBe(409);
    await expect(domain.json()).resolves.toEqual({
      ok: false,
      error: { code: "BLOCKED", message: "blocked", details: { reason: "test" } },
    });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unexpected = await apiHandler(async () => {
      throw new Error("database password must never leak");
    });
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" },
    });
  });
});
