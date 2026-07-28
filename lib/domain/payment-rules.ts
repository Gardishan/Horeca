import type { PaymentStatus } from "@prisma/client";

export type PaymentDecision = "CONFIRM" | "REJECT";

export type PaymentDecisionResult = {
  allowed: boolean;
  idempotent: boolean;
};

export function evaluatePaymentDecision(
  status: PaymentStatus,
  decision: PaymentDecision,
): PaymentDecisionResult {
  const targetStatus = decision === "CONFIRM" ? "CONFIRMED" : "REJECTED";
  if (status === targetStatus) return { allowed: true, idempotent: true };
  if (status === "PROOF_UPLOADED") return { allowed: true, idempotent: false };
  return { allowed: false, idempotent: false };
}
