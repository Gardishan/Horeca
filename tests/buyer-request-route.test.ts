import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  createBuyerRequest: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("@/lib/services/catalog", () => ({ createBuyerRequest: mocks.createBuyerRequest }));

import { POST } from "@/app/api/buyer-requests/route";

const ORIGIN = "http://127.0.0.1:3116";
const buyerRequest = {
  productId: "product-coffee",
  buyerName: "Demo Buyer",
  buyerCompany: "Demo Cafe",
  phone: "+77010000000",
  email: "buyer@example.test",
  message: "Прошу направить демонстрационное предложение.",
  quantity: 10,
  website: "",
};
const storedFields = {
  productId: "product-coffee",
  buyerName: "Demo Buyer",
  buyerCompany: "Demo Cafe",
  phone: "+77010000000",
  email: "buyer@example.test",
  message: "Прошу направить демонстрационное предложение.",
  quantity: 10,
};

function post(body: Record<string, unknown>) {
  return POST(new Request(`${ORIGIN}/api/buyer-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": "203.0.113.10" },
    body: JSON.stringify(body),
  }));
}

function useBeta(demoOnly: "true" | "false") {
  vi.stubEnv("APP_ENV", "beta");
  vi.stubEnv("BETA_ENABLED", "true");
  vi.stubEnv("BETA_DEMO_ONLY", demoOnly);
}

describe("POST /api/buyer-requests Beta demo-contact guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("BETA_DEMO_ONLY", "false");
    mocks.assertRateLimit.mockResolvedValue(undefined);
    mocks.createBuyerRequest.mockResolvedValue({ id: "request-1", status: "NEW", createdAt: "2026-09-24T00:00:00.000Z" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the public request contract unchanged outside Beta", async () => {
    const response = await post(buyerRequest);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { id: "request-1" } });
    expect(mocks.createBuyerRequest).toHaveBeenCalledWith(storedFields);
  });

  it("never forwards the acknowledgement flag to persistence", async () => {
    const response = await post({ ...buyerRequest, betaDemoAcknowledged: true });

    expect(response.status).toBe(201);
    expect(mocks.createBuyerRequest).toHaveBeenCalledWith(storedFields);
  });

  it.each([
    ["missing", {}],
    ["false", { betaDemoAcknowledged: false }],
  ])("rejects a Beta buyer request with a %s demo-contact acknowledgement", async (_label, acknowledgement) => {
    useBeta("true");

    const response = await post({ ...buyerRequest, ...acknowledgement });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "BETA_DEMO_CONTACT_REQUIRED", message: expect.stringMatching(/демонстрацион/i) },
    });
    expect(mocks.createBuyerRequest).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean acknowledgement at the validation boundary", async () => {
    useBeta("true");

    const response = await post({ ...buyerRequest, betaDemoAcknowledged: "true" });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.createBuyerRequest).not.toHaveBeenCalled();
  });

  it("accepts an acknowledged demo buyer request in a demo-only Beta", async () => {
    useBeta("true");

    const response = await post({ ...buyerRequest, betaDemoAcknowledged: true });

    expect(response.status).toBe(201);
    expect(mocks.createBuyerRequest).toHaveBeenCalledWith(storedFields);
  });

  it("refuses buyer contacts when the Beta is not demo-only", async () => {
    useBeta("false");

    const response = await post({ ...buyerRequest, betaDemoAcknowledged: true });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "BETA_UNAVAILABLE" } });
    expect(mocks.createBuyerRequest).not.toHaveBeenCalled();
  });
});
