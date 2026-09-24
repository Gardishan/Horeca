import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verificationFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyVerification: { findMany: mocks.verificationFindMany },
  },
}));

import { ADMIN_QUEUE_LIMIT, listAdminVerifications } from "@/lib/services/admin";

const PROOF_PATH = "private/company-upgrade/payment-proof.pdf";

function document(id: string, status: string, verificationId?: string) {
  return {
    id,
    type: "REGISTRATION",
    originalName: `${id}.pdf`,
    status,
    antivirusStatus: "SKIPPED_MOCK",
    uploadedAt: new Date("2026-09-20T07:00:00.000Z"),
    adminComment: null,
    ...(verificationId ? { verificationId } : {}),
  };
}

describe("admin verification review queue", () => {
  beforeEach(() => vi.resetAllMocks());

  function pendingAttempt(overrides: Record<string, unknown> = {}) {
    return {
      id: "verification-v2",
      companyId: "company-pending",
      status: "PENDING",
      submittedAt: new Date("2026-09-21T07:00:00.000Z"),
      reviewedAt: null,
      adminComment: null,
      createdAt: new Date("2026-09-21T06:00:00.000Z"),
      documents: [document("doc-v2-registration", "UNDER_REVIEW"), document("doc-v2-bank", "APPROVED")],
      company: {
        id: "company-pending",
        name: "Fresh Horeca Distribution",
        binIin: "240140067890",
        city: "Алматы",
        documents: [
          document("doc-v1-certificate", "APPROVED", "verification-v1"),
          document("doc-v1-license", "UNDER_REVIEW", "verification-v1"),
          document("doc-v2-bank", "APPROVED", "verification-v2"),
          document("doc-v2-registration", "UNDER_REVIEW", "verification-v2"),
        ],
        payments: [
          {
            id: "payment-start",
            companyId: "company-pending",
            invoiceId: "invoice-start",
            amount: "15000",
            currency: "KZT",
            method: "MANUAL_BANK_TRANSFER",
            status: "PROOF_UPLOADED",
            proofFilePath: PROOF_PATH,
            adminComment: null,
            paidAt: null,
            confirmedAt: null,
            createdAt: new Date("2026-09-21T06:30:00.000Z"),
            updatedAt: new Date("2026-09-21T06:30:00.000Z"),
          },
        ],
        subscriptions: [{ id: "subscription-start", status: "PENDING_PAYMENT", plan: { code: "START", name: "START" } }],
      },
      ...overrides,
    };
  }

  it("lists only actionable PENDING attempts by default, oldest first and bounded", async () => {
    mocks.verificationFindMany.mockResolvedValue([]);

    await listAdminVerifications();

    const query = mocks.verificationFindMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: "PENDING" });
    expect(query.orderBy).toEqual([{ submittedAt: "asc" }, { id: "asc" }]);
    expect(query.take).toBe(ADMIN_QUEUE_LIMIT);
    expect(query).not.toHaveProperty("include");
  });

  it("keeps an explicit status filter for terminal attempts", async () => {
    mocks.verificationFindMany.mockResolvedValue([]);

    await listAdminVerifications("REUPLOAD_REQUESTED");

    expect(mocks.verificationFindMany.mock.calls[0][0].where).toEqual({ status: "REUPLOAD_REQUESTED" });
  });

  it("scopes documents to the attempt and never selects storage locators", async () => {
    mocks.verificationFindMany.mockResolvedValue([]);

    await listAdminVerifications();

    const select = mocks.verificationFindMany.mock.calls[0][0].select;
    expect(select.documents.take).toBe(ADMIN_QUEUE_LIMIT);
    expect(select.documents.select).not.toHaveProperty("storagePath");
    expect(select.documents.select).not.toHaveProperty("storedName");
    expect(select.company.select.documents.where).toEqual({ status: { in: ["APPROVED", "UNDER_REVIEW"] } });
    expect(select.company.select.documents.select).not.toHaveProperty("storagePath");
  });

  it("returns attempt documents and only relevant earlier documents", async () => {
    mocks.verificationFindMany.mockResolvedValue([pendingAttempt()]);

    const [verification] = await listAdminVerifications();

    expect(verification.documents.map((item) => item.id)).toEqual(["doc-v2-registration", "doc-v2-bank"]);
    expect(verification.earlierDocuments.map((item) => item.id)).toEqual(["doc-v1-certificate", "doc-v1-license"]);
    expect(verification.earlierDocuments[0]).not.toHaveProperty("verificationId");
    expect(verification.company).toMatchObject({ id: "company-pending", name: "Fresh Horeca Distribution", binIin: "240140067890", city: "Алматы" });
    expect(verification.company).not.toHaveProperty("documents");
    expect(verification.company.payments[0]).toMatchObject({ id: "payment-start", hasProof: true });
    expect(verification.company.payments[0]).not.toHaveProperty("proofFilePath");
    expect(JSON.stringify(verification)).not.toContain(PROOF_PATH);
  });
});
