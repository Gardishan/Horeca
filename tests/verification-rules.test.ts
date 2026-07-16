import { describe, expect, it } from "vitest";
import { evaluateCompanyActivation, evaluateVerificationSubmission, profileCompletion } from "@/lib/domain/verification-rules";

const profile = {
  name: "Qazaq Supply",
  legalName: "ТОО Qazaq Supply",
  binIin: "220540012345",
  address: "Алматы, Толе би, 155",
  city: "Алматы",
  categories: ["кофе"],
  deliveryCities: ["Алматы"],
  description: "Поставщик для ресторанов, кофеен и отелей Казахстана.",
  phone: "+77010000000",
  email: "sales@example.kz",
};

describe("verification submission", () => {
  it("accepts a complete manual-payment application", () => {
    const result = evaluateVerificationSubmission({
      profile,
      acceptedLegalTypes: ["OFFER", "PRIVACY"],
      documents: [{ type: "REGISTRATION", status: "UPLOADED" }],
      hasSelectedPlan: true,
      hasInvoice: true,
      paymentStatus: "PENDING",
    });
    expect(result).toEqual({ allowed: true, reasons: [] });
  });

  it("reports missing onboarding requirements", () => {
    const result = evaluateVerificationSubmission({
      profile: { ...profile, binIin: "" },
      acceptedLegalTypes: [],
      documents: [],
      hasSelectedPlan: false,
      hasInvoice: false,
      paymentStatus: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(6);
  });
});

describe("company activation", () => {
  it("requires all reviewed documents and confirmed payment", () => {
    const accepted = evaluateCompanyActivation({ profile, acceptedLegalTypes: ["OFFER", "PRIVACY"], documentStatuses: ["APPROVED", "APPROVED"], paymentStatus: "CONFIRMED" });
    expect(accepted.allowed).toBe(true);
    const rejected = evaluateCompanyActivation({ profile, acceptedLegalTypes: ["OFFER", "PRIVACY"], documentStatuses: ["APPROVED", "UNDER_REVIEW"], paymentStatus: "PROOF_UPLOADED" });
    expect(rejected.allowed).toBe(false);
    expect(rejected.reasons).toHaveLength(2);
  });

  it("computes profile completeness deterministically", () => {
    expect(profileCompletion(profile)).toMatchObject({ complete: true, percent: 100 });
    expect(profileCompletion({ ...profile, phone: "" }).percent).toBe(90);
  });
});

