import { describe, expect, it } from "vitest";
import {
  evaluateCompanyActivation,
  evaluateDocumentDecision,
  evaluateVerificationSubmission,
  evaluateVerificationDecision,
  isDocumentSafeForApproval,
  profileCompletion,
} from "@/lib/domain/verification-rules";

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
    const accepted = evaluateCompanyActivation({
      profile,
      acceptedLegalTypes: ["OFFER", "PRIVACY"],
      documents: [
        { status: "APPROVED", antivirusStatus: "CLEAN" },
        { status: "APPROVED", antivirusStatus: "CLEAN" },
      ],
      deployed: true,
      paymentStatus: "CONFIRMED",
    });
    expect(accepted.allowed).toBe(true);
    const rejected = evaluateCompanyActivation({
      profile,
      acceptedLegalTypes: ["OFFER", "PRIVACY"],
      documents: [
        { status: "APPROVED", antivirusStatus: "CLEAN" },
        { status: "UNDER_REVIEW", antivirusStatus: "CLEAN" },
      ],
      deployed: true,
      paymentStatus: "PROOF_UPLOADED",
    });
    expect(rejected.allowed).toBe(false);
    expect(rejected.reasons).toHaveLength(2);
  });

  it("rejects an approved legacy mock file in a deployed environment", () => {
    const result = evaluateCompanyActivation({
      profile,
      acceptedLegalTypes: ["OFFER", "PRIVACY"],
      documents: [
        { status: "APPROVED", antivirusStatus: "SKIPPED_MOCK" },
      ],
      deployed: true,
      paymentStatus: "CONFIRMED",
    });

    expect(result).toEqual({
      allowed: false,
      reasons: ["Не все документы прошли антивирусную проверку"],
    });
  });

  it("computes profile completeness deterministically", () => {
    expect(profileCompletion(profile)).toMatchObject({ complete: true, percent: 100 });
    expect(profileCompletion({ ...profile, phone: "" }).percent).toBe(90);
  });
});

describe("document antivirus approval", () => {
  it("allows clean files everywhere and mock-scanned files only outside deployed environments", () => {
    expect(isDocumentSafeForApproval("CLEAN", false)).toBe(true);
    expect(isDocumentSafeForApproval("CLEAN", true)).toBe(true);
    expect(isDocumentSafeForApproval("SKIPPED_MOCK", false)).toBe(true);
    expect(isDocumentSafeForApproval("SKIPPED_MOCK", true)).toBe(false);
  });

  it.each(["PENDING", "SUSPICIOUS"] as const)(
    "never approves %s files",
    (status) => {
      expect(isDocumentSafeForApproval(status, false)).toBe(false);
      expect(isDocumentSafeForApproval(status, true)).toBe(false);
    },
  );
});

describe("review decision state machines", () => {
  it("allows verification decisions only from pending and keeps repeats idempotent", () => {
    expect(evaluateVerificationDecision("PENDING", "APPROVED")).toEqual({
      allowed: true,
      idempotent: false,
    });
    expect(evaluateVerificationDecision("APPROVED", "APPROVED")).toEqual({
      allowed: true,
      idempotent: true,
    });
    expect(evaluateVerificationDecision("APPROVED", "REJECTED").allowed).toBe(false);
    expect(evaluateVerificationDecision("NOT_STARTED", "APPROVED").allowed).toBe(false);
  });

  it("allows document decisions only from under review and prevents reversal", () => {
    expect(evaluateDocumentDecision("UNDER_REVIEW", "APPROVED")).toEqual({
      allowed: true,
      idempotent: false,
    });
    expect(evaluateDocumentDecision("REJECTED", "REJECTED")).toEqual({
      allowed: true,
      idempotent: true,
    });
    expect(evaluateDocumentDecision("APPROVED", "REUPLOAD_REQUESTED").allowed).toBe(false);
    expect(evaluateDocumentDecision("UPLOADED", "APPROVED").allowed).toBe(false);
  });
});
