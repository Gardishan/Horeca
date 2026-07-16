import { describe, expect, it } from "vitest";
import { evaluateProductPublication, evaluatePublicVisibility } from "@/lib/domain/product-rules";

describe("product publication policy", () => {
  const valid = {
    companyStatus: "ACTIVE" as const,
    verificationStatus: "APPROVED" as const,
    companyBlocked: false,
    subscriptionStatus: "ACTIVE" as const,
    paymentStatus: "CONFIRMED" as const,
    publishedCount: 9,
    maxProducts: 10,
  };

  it("allows an eligible supplier within the plan limit", () => {
    expect(evaluateProductPublication(valid)).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks the next product once the plan limit is reached", () => {
    const result = evaluateProductPublication({ ...valid, publishedCount: 10 });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Лимит тарифа");
  });

  it("does not double-count an already published product", () => {
    expect(evaluateProductPublication({ ...valid, publishedCount: 10, productAlreadyPublished: true }).allowed).toBe(true);
  });

  it("returns every blocking reason instead of hiding the first failure", () => {
    const result = evaluateProductPublication({
      ...valid,
      companyStatus: "BLOCKED",
      companyBlocked: true,
      verificationStatus: "PENDING",
      subscriptionStatus: "PENDING_PAYMENT",
      paymentStatus: "PROOF_UPLOADED",
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(5);
  });
});

describe("public catalog policy", () => {
  it("only exposes the complete trusted state", () => {
    expect(evaluatePublicVisibility({ productStatus: "PUBLISHED", companyStatus: "ACTIVE", verificationStatus: "APPROVED", companyBlocked: false, subscriptionStatus: "ACTIVE" }).allowed).toBe(true);
    expect(evaluatePublicVisibility({ productStatus: "PUBLISHED", companyStatus: "ACTIVE", verificationStatus: "PENDING", companyBlocked: false, subscriptionStatus: "ACTIVE" }).allowed).toBe(false);
  });
});

