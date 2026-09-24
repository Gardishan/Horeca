import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BETA_ACCESS_MAX_AGE_SECONDS,
  assertBetaDemoContact,
  assertBetaDemoMaterial,
  assertBetaManualPayment,
  assertBetaRegistrationAllowed,
  createBetaAccessCookieValue,
  evaluateBetaRequest,
  safeBetaReturnPath,
  verifyBetaAccessCookie,
  verifyBetaAccessToken,
} from "@/lib/beta-safety";

function betaEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    APP_ENV: "beta",
    AUTH_SECRET: "beta-cookie-secret-with-at-least-thirty-two-characters",
    BETA_ENABLED: "true",
    BETA_ACCESS_TOKEN: "beta-access-token-with-at-least-thirty-two-characters",
    BETA_DEMO_ONLY: "true",
    BETA_REGISTRATION_ENABLED: "false",
  };
}

describe("controlled beta safety", () => {
  it("gates every non-exempt page and API behind a signed access cookie", () => {
    const environment = betaEnvironment();
    const nowSeconds = 1_800_000_000;
    const cookieValue = createBetaAccessCookieValue(environment, nowSeconds);

    expect(evaluateBetaRequest({ pathname: "/catalog", environment })).toBe("redirect");
    expect(evaluateBetaRequest({ pathname: "/api/catalog/products", environment })).toBe(
      "unauthorized",
    );
    expect(evaluateBetaRequest({ pathname: "/beta-access", environment })).toBe("allow");
    expect(evaluateBetaRequest({ pathname: "/api/health/live", environment })).toBe("allow");
    expect(
      evaluateBetaRequest({ pathname: "/catalog", cookieValue, environment, nowSeconds }),
    ).toBe("allow");
    expect(verifyBetaAccessCookie(cookieValue, environment, nowSeconds)).toBe(true);
    expect(
      verifyBetaAccessCookie(
        cookieValue,
        environment,
        nowSeconds + BETA_ACCESS_MAX_AGE_SECONDS,
      ),
    ).toBe(false);
    expect(verifyBetaAccessCookie(`${cookieValue}x`, environment, nowSeconds)).toBe(false);
    expect(
      verifyBetaAccessCookie(cookieValue, {
        ...environment,
        BETA_ACCESS_TOKEN: "rotated-beta-access-token-with-at-least-thirty-two-characters",
      }, nowSeconds),
    ).toBe(false);
  });

  it("keeps the operator kill switch fail closed", () => {
    const environment = { ...betaEnvironment(), BETA_ENABLED: "false" };

    expect(evaluateBetaRequest({ pathname: "/catalog", environment })).toBe("unavailable");
    expect(evaluateBetaRequest({ pathname: "/api/catalog/products", environment })).toBe(
      "unavailable",
    );
    expect(evaluateBetaRequest({ pathname: "/api/health/live", environment })).toBe("allow");
  });

  it("uses a constant-shape token check without accepting partial values", () => {
    const environment = betaEnvironment();

    expect(
      verifyBetaAccessToken(
        "beta-access-token-with-at-least-thirty-two-characters",
        environment,
      ),
    ).toBe(true);
    expect(verifyBetaAccessToken("beta-access-token-with-at-least", environment)).toBe(false);
    expect(verifyBetaAccessToken("", environment)).toBe(false);
  });

  it("blocks public registration unless the beta owner explicitly enables it", () => {
    expect(() => assertBetaRegistrationAllowed(betaEnvironment())).toThrowError(
      /регистрац/i,
    );
    expect(() =>
      assertBetaRegistrationAllowed({
        ...betaEnvironment(),
        BETA_REGISTRATION_ENABLED: "true",
      }),
    ).not.toThrow();
    expect(() =>
      assertBetaRegistrationAllowed({ APP_ENV: "test", NODE_ENV: "test" }),
    ).not.toThrow();
  });

  it("requires an explicit demo-only acknowledgement for uploads and payment signals", () => {
    const environment = betaEnvironment();
    const missing = new FormData();
    const acknowledged = new FormData();
    acknowledged.set("demoMaterialAcknowledged", "true");

    expect(() => assertBetaDemoMaterial(missing, environment)).toThrowError(/демонстрацион/i);
    expect(() => assertBetaDemoMaterial(acknowledged, environment)).not.toThrow();
    expect(() => assertBetaManualPayment(false, environment)).toThrowError(/демонстрацион/i);
    expect(() => assertBetaManualPayment(true, environment)).not.toThrow();
    expect(() =>
      assertBetaDemoMaterial(missing, { APP_ENV: "test", NODE_ENV: "test" }),
    ).not.toThrow();
  });

  it("requires an explicit demo-contact acknowledgement for buyer requests only in a demo-only Beta", () => {
    const environment = betaEnvironment();

    expect(() => assertBetaDemoContact(undefined, environment)).toThrowError(
      expect.objectContaining({ status: 422, code: "BETA_DEMO_CONTACT_REQUIRED" }),
    );
    expect(() => assertBetaDemoContact(false, environment)).toThrowError(/демонстрацион/i);
    expect(() => assertBetaDemoContact(true, environment)).not.toThrow();
    expect(() =>
      assertBetaDemoContact(true, { ...environment, BETA_DEMO_ONLY: "false" }),
    ).toThrowError(expect.objectContaining({ status: 503, code: "BETA_UNAVAILABLE" }));
    expect(() =>
      assertBetaDemoContact(undefined, { APP_ENV: "test", NODE_ENV: "test" }),
    ).not.toThrow();
  });

  it("accepts only local return paths after the access form", () => {
    expect(safeBetaReturnPath("/dashboard/company?step=profile")).toBe(
      "/dashboard/company?step=profile",
    );
    expect(safeBetaReturnPath("https://attacker.example")).toBe("/catalog");
    expect(safeBetaReturnPath("//attacker.example")).toBe("/catalog");
    expect(safeBetaReturnPath("/api/health/live")).toBe("/catalog");
    expect(safeBetaReturnPath("/_next/static/app.js")).toBe("/catalog");
    expect(safeBetaReturnPath("/beta-access?next=/catalog")).toBe("/catalog");
    expect(safeBetaReturnPath("not-a-path")).toBe("/catalog");
  });

  it("keeps every risky Beta mutation behind the shared server-side policy", () => {
    const guardedRoutes = new Map([
      ["app/api/auth/register/route.ts", "assertBetaRegistrationAllowed()"],
      ["app/api/dashboard/company/documents/route.ts", "assertBetaDemoMaterial(form)"],
      [
        "app/api/dashboard/company/billing/upload-payment-proof/route.ts",
        "assertBetaDemoMaterial(form)",
      ],
      [
        "app/api/dashboard/company/billing/mark-paid/route.ts",
        "assertBetaManualPayment(input.betaDemoAcknowledged)",
      ],
      ["app/api/buyer-requests/route.ts", "assertBetaDemoContact(betaDemoAcknowledged)"],
    ]);

    for (const [file, guard] of guardedRoutes) {
      expect(readFileSync(file, "utf8"), file).toContain(guard);
    }
  });
});
