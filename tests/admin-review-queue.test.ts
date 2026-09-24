import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  verificationFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: mocks.paymentFindMany },
    companyVerification: { findMany: mocks.verificationFindMany },
  },
}));

import { ADMIN_QUEUE_LIMIT, listAdminPendingPayments, listAdminVerifications } from "@/lib/services/admin";

const PROOF_PATH = "private/company-upgrade/payment-proof.pdf";

function queuedPayment(id: string, companyId: string, proofFilePath: string | null) {
  return {
    id,
    amount: "75000",
    currency: "KZT",
    method: "MANUAL_BANK_TRANSFER",
    status: "PROOF_UPLOADED",
    proofFilePath,
    paidAt: new Date("2026-09-20T08:00:00.000Z"),
    createdAt: new Date("2026-09-20T07:00:00.000Z"),
    updatedAt: new Date("2026-09-20T08:00:00.000Z"),
    company: { id: companyId, name: `Company ${companyId}`, binIin: "220540012345", status: "ACTIVE" },
    invoice: {
      id: `invoice-${id}`,
      invoiceNumber: `HKZ-${id}`,
      status: "PAID_PENDING_CONFIRMATION",
      subscription: { id: `subscription-${id}`, status: "PENDING_PAYMENT", plan: { code: "PREMIUM", name: "PREMIUM" } },
    },
  };
}

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

describe("admin payment review queue", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists proofs awaiting decision across companies, oldest first and bounded", async () => {
    mocks.paymentFindMany.mockResolvedValue([
      queuedPayment("payment-upgrade", "company-active", PROOF_PATH),
      queuedPayment("payment-onboarding", "company-pending", "private/company-pending/proof.pdf"),
    ]);

    const payments = await listAdminPendingPayments();

    expect(mocks.paymentFindMany).toHaveBeenCalledTimes(1);
    const query = mocks.paymentFindMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: "PROOF_UPLOADED" });
    expect(query.where).not.toHaveProperty("companyId");
    expect(query.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(query.take).toBe(ADMIN_QUEUE_LIMIT);
    expect(ADMIN_QUEUE_LIMIT).toBe(50);
    expect(query.select.company).toEqual({ select: { id: true, name: true, binIin: true, status: true } });
    expect(query.select.invoice.select.subscription.select.plan).toEqual({ select: { code: true, name: true } });
    expect(query).not.toHaveProperty("include");
    expect(payments.map((payment) => payment.company.id)).toEqual(["company-active", "company-pending"]);
    expect(payments[0]).toMatchObject({ id: "payment-upgrade", hasProof: true, invoice: { invoiceNumber: "HKZ-payment-upgrade" } });
  });

  it("never returns the private proof locator and reports a missing proof", async () => {
    mocks.paymentFindMany.mockResolvedValue([
      queuedPayment("payment-upgrade", "company-active", PROOF_PATH),
      queuedPayment("payment-no-file", "company-other", null),
    ]);

    const payments = await listAdminPendingPayments();

    for (const payment of payments) expect(payment).not.toHaveProperty("proofFilePath");
    expect(JSON.stringify(payments)).not.toContain(PROOF_PATH);
    expect(payments.map((payment) => payment.hasProof)).toEqual([true, false]);
  });
});

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
        subscriptions: [
          {
            id: "subscription-premium",
            status: "PENDING_PAYMENT",
            plan: { code: "PREMIUM", name: "PREMIUM" },
            invoices: [
              {
                id: "invoice-premium",
                invoiceNumber: "HKZ-PREMIUM",
                status: "PAID_PENDING_CONFIRMATION",
                payments: [
                  {
                    id: "payment-premium",
                    companyId: "company-pending",
                    invoiceId: "invoice-premium",
                    amount: "75000",
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
              },
            ],
          },
        ],
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
    expect(select.company.select).not.toHaveProperty("payments");
    expect(select.company.select.subscriptions.where).toEqual({ status: { in: ["PENDING_PAYMENT", "ACTIVE"] } });
    expect(select.company.select.subscriptions.select.invoices.where).toEqual({ status: { not: "CANCELLED" } });
  });

  it("returns attempt documents, relevant earlier documents and the current subscription payment", async () => {
    mocks.verificationFindMany.mockResolvedValue([pendingAttempt()]);

    const [verification] = await listAdminVerifications();

    expect(verification.documents.map((item) => item.id)).toEqual(["doc-v2-registration", "doc-v2-bank"]);
    expect(verification.earlierDocuments.map((item) => item.id)).toEqual(["doc-v1-certificate", "doc-v1-license"]);
    expect(verification.earlierDocuments[0]).not.toHaveProperty("verificationId");
    expect(verification.company).toEqual({ id: "company-pending", name: "Fresh Horeca Distribution", binIin: "240140067890", city: "Алматы" });
    expect(verification.subscription).toEqual({ id: "subscription-premium", status: "PENDING_PAYMENT", plan: { code: "PREMIUM", name: "PREMIUM" } });
    expect(verification.invoice).toEqual({ id: "invoice-premium", invoiceNumber: "HKZ-PREMIUM", status: "PAID_PENDING_CONFIRMATION" });
    expect(verification.payment).toMatchObject({ id: "payment-premium", status: "PROOF_UPLOADED", hasProof: true });
    expect(JSON.stringify(verification)).not.toContain(PROOF_PATH);
    expect(verification.payment).not.toHaveProperty("proofFilePath");
  });

  it("reports no payment when the current subscription has no invoice yet", async () => {
    const attempt = pendingAttempt();
    attempt.company.subscriptions[0].invoices = [];
    mocks.verificationFindMany.mockResolvedValue([attempt]);

    const [verification] = await listAdminVerifications();

    expect(verification.subscription?.plan.code).toBe("PREMIUM");
    expect(verification.invoice).toBeNull();
    expect(verification.payment).toBeNull();
  });

  it("reports no plan when the company has no current subscription", async () => {
    const attempt = pendingAttempt();
    attempt.company.subscriptions = [];
    mocks.verificationFindMany.mockResolvedValue([attempt]);

    const [verification] = await listAdminVerifications();

    expect(verification.subscription).toBeNull();
    expect(verification.invoice).toBeNull();
    expect(verification.payment).toBeNull();
  });
});
