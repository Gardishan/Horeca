import { describe, expect, it } from "vitest";
import {
  evaluateCompanyActivation,
  evaluateDocumentDecision,
  evaluateVerificationSubmission,
  evaluateVerificationDecision,
  isDocumentSafeForApproval,
  isVerificationSubmissionLocked,
  profileCompletion,
  type ActivationContext,
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

type ActivationDocument = ActivationContext["documents"][number];

function doc(
  type: ActivationDocument["type"],
  status: ActivationDocument["status"],
  uploadedAt: string,
  antivirusStatus: ActivationDocument["antivirusStatus"] = "CLEAN",
): ActivationDocument {
  return { type, status, antivirusStatus, uploadedAt: new Date(uploadedAt) };
}

function activation(documents: ActivationDocument[], deployed = true) {
  return evaluateCompanyActivation({
    profile,
    acceptedLegalTypes: ["OFFER", "PRIVACY"],
    documents,
    deployed,
    paymentStatus: "CONFIRMED",
  });
}

describe("company activation", () => {
  it("requires all reviewed documents and confirmed payment", () => {
    const accepted = evaluateCompanyActivation({
      profile,
      acceptedLegalTypes: ["OFFER", "PRIVACY"],
      documents: [
        doc("REGISTRATION", "APPROVED", "2026-08-01T00:00:00.000Z"),
        doc("BANK_DETAILS", "APPROVED", "2026-08-01T00:00:00.000Z"),
      ],
      deployed: true,
      paymentStatus: "CONFIRMED",
    });
    expect(accepted.allowed).toBe(true);
    const rejected = evaluateCompanyActivation({
      profile,
      acceptedLegalTypes: ["OFFER", "PRIVACY"],
      documents: [
        doc("REGISTRATION", "APPROVED", "2026-08-01T00:00:00.000Z"),
        doc("BANK_DETAILS", "UNDER_REVIEW", "2026-08-01T00:00:00.000Z"),
      ],
      deployed: true,
      paymentStatus: "PROOF_UPLOADED",
    });
    expect(rejected.allowed).toBe(false);
    expect(rejected.reasons).toHaveLength(2);
  });

  it("rejects an approved legacy mock file in a deployed environment", () => {
    const result = activation([
      doc("REGISTRATION", "APPROVED", "2026-08-01T00:00:00.000Z", "SKIPPED_MOCK"),
    ]);

    expect(result).toEqual({
      allowed: false,
      reasons: ["Не все документы прошли антивирусную проверку"],
    });
  });

  it.each(["REJECTED", "REUPLOAD_REQUESTED"] as const)(
    "ignores a %s document superseded by a newer approved upload of the same type",
    (status) => {
      expect(activation([
        doc("REGISTRATION", "APPROVED", "2026-08-05T00:00:00.000Z"),
        doc("REGISTRATION", status, "2026-08-01T00:00:00.000Z", "PENDING"),
        doc("PRICE_LIST", "APPROVED", "2026-08-06T00:00:00.000Z"),
        doc("PRICE_LIST", status, "2026-08-02T00:00:00.000Z"),
      ])).toEqual({ allowed: true, reasons: [] });
    },
  );

  it("keeps a still-rejected current document blocking activation", () => {
    expect(activation([
      doc("REGISTRATION", "REJECTED", "2026-08-05T00:00:00.000Z"),
      doc("REGISTRATION", "APPROVED", "2026-08-01T00:00:00.000Z"),
    ])).toEqual({ allowed: false, reasons: ["Не все документы одобрены"] });
    expect(activation([
      doc("REGISTRATION", "APPROVED", "2026-08-01T00:00:00.000Z"),
      doc("PRICE_LIST", "REUPLOAD_REQUESTED", "2026-08-02T00:00:00.000Z"),
    ])).toEqual({ allowed: false, reasons: ["Не все документы одобрены"] });
  });

  it("does not treat an equally old upload as a replacement", () => {
    expect(activation([
      doc("REGISTRATION", "APPROVED", "2026-08-01T00:00:00.000Z"),
      doc("REGISTRATION", "REJECTED", "2026-08-01T00:00:00.000Z"),
    ]).allowed).toBe(false);
  });

  it.each(["UPLOADED", "UNDER_REVIEW"] as const)(
    "keeps an unreviewed %s replacement blocking activation",
    (status) => {
      expect(activation([
        doc("REGISTRATION", status, "2026-08-05T00:00:00.000Z"),
        doc("REGISTRATION", "REJECTED", "2026-08-01T00:00:00.000Z"),
        doc("BIN_IIN", "APPROVED", "2026-08-01T00:00:00.000Z"),
      ])).toEqual({ allowed: false, reasons: ["Не все документы одобрены"] });
    },
  );

  it("requires an approved registration or BIN/IIN document among current documents", () => {
    expect(activation([doc("CERTIFICATE", "APPROVED", "2026-08-01T00:00:00.000Z")])).toEqual({
      allowed: false,
      reasons: ["Нет одобренного свидетельства регистрации или документа БИН/ИИН"],
    });
    expect(activation([doc("BIN_IIN", "APPROVED", "2026-08-01T00:00:00.000Z")]).allowed).toBe(true);
    expect(activation([]).reasons).toEqual([
      "Не все документы одобрены",
      "Нет одобренного свидетельства регистрации или документа БИН/ИИН",
    ]);
  });

  it("checks antivirus safety only on documents that still count", () => {
    expect(activation([
      doc("REGISTRATION", "APPROVED", "2026-08-05T00:00:00.000Z"),
      doc("REGISTRATION", "REJECTED", "2026-08-01T00:00:00.000Z", "SKIPPED_MOCK"),
    ])).toEqual({ allowed: true, reasons: [] });
    expect(activation([
      doc("REGISTRATION", "APPROVED", "2026-08-05T00:00:00.000Z"),
      doc("CERTIFICATE", "APPROVED", "2026-08-01T00:00:00.000Z", "SKIPPED_MOCK"),
    ]).reasons).toEqual(["Не все документы прошли антивирусную проверку"]);
  });

  it("computes profile completeness deterministically", () => {
    expect(profileCompletion(profile)).toMatchObject({ complete: true, percent: 100 });
    expect(profileCompletion({ ...profile, phone: "" }).percent).toBe(90);
  });
});

describe("company lifecycle guards", () => {
  it("locks verification resubmission only for an active company", () => {
    expect(isVerificationSubmissionLocked("ACTIVE")).toBe(true);
    for (const status of ["DRAFT", "PENDING_REVIEW", "REJECTED", "BLOCKED"] as const) {
      expect(isVerificationSubmissionLocked(status)).toBe(false);
    }
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
