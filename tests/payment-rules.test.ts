import { describe, expect, it } from "vitest";
import { evaluatePaymentDecision } from "@/lib/domain/payment-rules";

describe("payment decision rules", () => {
  it("allows an admin decision only after a proof was uploaded", () => {
    expect(evaluatePaymentDecision("PROOF_UPLOADED", "CONFIRM")).toEqual({
      allowed: true,
      idempotent: false,
    });
    expect(evaluatePaymentDecision("PROOF_UPLOADED", "REJECT")).toEqual({
      allowed: true,
      idempotent: false,
    });

    for (const status of ["PENDING", "REJECTED"] as const) {
      expect(evaluatePaymentDecision(status, "CONFIRM").allowed).toBe(false);
    }
    expect(evaluatePaymentDecision("PENDING", "REJECT").allowed).toBe(false);
  });

  it("keeps terminal decisions idempotent and prevents reversal", () => {
    expect(evaluatePaymentDecision("CONFIRMED", "CONFIRM")).toEqual({
      allowed: true,
      idempotent: true,
    });
    expect(evaluatePaymentDecision("REJECTED", "REJECT")).toEqual({
      allowed: true,
      idempotent: true,
    });
    expect(evaluatePaymentDecision("CONFIRMED", "REJECT").allowed).toBe(false);
    expect(evaluatePaymentDecision("REJECTED", "CONFIRM").allowed).toBe(false);
  });
});
