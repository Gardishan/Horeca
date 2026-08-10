import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  companyFindUnique: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    company: { findUnique: mocks.companyFindUnique },
  },
}));

vi.mock("@/lib/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

import {
  confirmPayment,
  markInvoicePaid,
  recordPaymentProof,
  rejectPayment,
} from "@/lib/services/billing";
import {
  registerCompanyDocument,
  submitCompanyVerification,
} from "@/lib/services/verification";

function runTransactionWith(transactionClient: object) {
  mocks.transaction.mockImplementationOnce(
    async (callback: (client: object) => Promise<unknown>) => callback(transactionClient),
  );
}

function verificationContext(status: "PENDING" | "APPROVED" | "REJECTED" | "REUPLOAD_REQUESTED") {
  return {
    id: "company-1",
    name: "Supplier",
    legalName: "Supplier LLP",
    binIin: "123456789012",
    address: "Abay 1",
    city: "Almaty",
    categories: ["Coffee"],
    deliveryCities: ["Almaty"],
    description: "Verified supplier",
    phone: "+77010000000",
    email: "supplier@example.kz",
    status: status === "PENDING" ? "PENDING_REVIEW" : "DRAFT",
    verificationStatus: status,
    isBlocked: false,
    legalAcceptances: [{ type: "OFFER" }, { type: "PRIVACY" }],
    documents: [{ type: "REGISTRATION", status: "APPROVED" }],
    subscriptions: [{ id: "subscription-1" }],
    invoices: [{ id: "invoice-1" }],
    payments: [{ status: "PROOF_UPLOADED" }],
    verifications: [
      {
        id: "verification-current",
        companyId: "company-1",
        status,
        submittedAt: new Date("2026-08-01T00:00:00.000Z"),
        reviewedAt: status === "PENDING" ? null : new Date("2026-08-02T00:00:00.000Z"),
        reviewedById: status === "PENDING" ? null : "admin-1",
        adminComment: status === "PENDING" ? null : "terminal evidence",
      },
    ],
  };
}

describe("service security boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never exposes a private payment proof locator from a mutation response", async () => {
    const payment = {
      id: "payment-1",
      companyId: "company-1",
      invoiceId: "invoice-1",
      status: "PROOF_UPLOADED",
      proofFilePath: "private/company-1/payment-proof.pdf",
      paidAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const transactionClient = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invoice-1",
          invoiceNumber: "HKZ-1",
          status: "ISSUED",
          payments: [payment],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(payment),
      },
      billingHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    runTransactionWith(transactionClient);

    const result = await recordPaymentProof(
      "company-1",
      "invoice-1",
      "private/company-1/payment-proof.pdf",
    );

    expect(result).toMatchObject({ id: "payment-1", hasProof: true });
    expect(result).not.toHaveProperty("proofFilePath");
  });

  it("sanitizes mark-paid and both terminal payment decision responses", async () => {
    const proofFilePath = "private/company-1/payment-proof.pdf";
    const rejectedPayment = {
      id: "payment-rejected",
      companyId: "company-1",
      invoiceId: "invoice-1",
      status: "REJECTED",
      proofFilePath,
      paidAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const markPaidClient = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invoice-1",
          status: "ISSUED",
          payments: [rejectedPayment],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...rejectedPayment,
          status: "PENDING",
        }),
      },
    };
    runTransactionWith(markPaidClient);
    const markedPaid = await markInvoicePaid("company-1", "invoice-1");

    const confirmedPayment = {
      id: "payment-confirmed",
      companyId: "company-1",
      invoiceId: "invoice-2",
      status: "CONFIRMED",
      proofFilePath,
      invoice: { subscription: { status: "ACTIVE" } },
    };
    runTransactionWith({
      payment: { findUnique: vi.fn().mockResolvedValue(confirmedPayment) },
    });
    const confirmed = await confirmPayment("payment-confirmed", "admin-1", "");

    runTransactionWith({
      payment: { findUnique: vi.fn().mockResolvedValue(rejectedPayment) },
    });
    const rejected = await rejectPayment("payment-rejected", "admin-1", "already rejected");

    for (const response of [markedPaid, confirmed, rejected]) {
      expect(response).toMatchObject({ hasProof: true });
      expect(response).not.toHaveProperty("proofFilePath");
    }
  });

  it("starts a new draft attempt immediately after terminal reupload evidence", async () => {
    const terminal = { id: "verification-terminal", status: "REUPLOAD_REQUESTED" };
    const draft = { id: "verification-draft", status: "NOT_STARTED" };
    const documentCreate = vi.fn().mockImplementation(({ data }) => data);
    const transactionClient = {
      companyVerification: {
        findFirst: vi.fn().mockResolvedValue(terminal),
        create: vi.fn().mockResolvedValue(draft),
      },
      companyDocument: { create: documentCreate },
    };
    runTransactionWith(transactionClient);

    await registerCompanyDocument({
      companyId: "company-1",
      type: "REGISTRATION",
      originalName: "registration.pdf",
      storedName: "stored-registration.pdf",
      storagePath: "private/company-1/registration.pdf",
      mimeType: "application/pdf",
      size: 512,
      antivirusStatus: "CLEAN",
    });

    expect(transactionClient.companyVerification.create).toHaveBeenCalledWith({
      data: { companyId: "company-1" },
    });
    expect(documentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ verificationId: "verification-draft" }),
    }));
  });

  it("reuses a pending attempt instead of creating a parallel verification", async () => {
    const pending = { id: "verification-pending", status: "PENDING" };
    const findFirst = vi.fn().mockImplementation(({ where }) => {
      const accepted = where.status?.in as string[] | undefined;
      return !accepted || accepted.includes("PENDING") ? pending : null;
    });
    const documentCreate = vi.fn().mockImplementation(({ data }) => data);
    const transactionClient = {
      companyVerification: {
        findFirst,
        create: vi.fn().mockResolvedValue({ id: "unexpected-new-attempt" }),
      },
      companyDocument: { create: documentCreate },
    };
    runTransactionWith(transactionClient);

    await registerCompanyDocument({
      companyId: "company-1",
      type: "REGISTRATION",
      originalName: "registration.pdf",
      storedName: "stored-registration.pdf",
      storagePath: "private/company-1/registration.pdf",
      mimeType: "application/pdf",
      size: 512,
      antivirusStatus: "CLEAN",
    });

    expect(transactionClient.companyVerification.create).not.toHaveBeenCalled();
    expect(documentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        verificationId: "verification-pending",
        status: "UNDER_REVIEW",
      }),
    }));
  });

  it("creates a new attempt without mutating terminal review evidence", async () => {
    const company = verificationContext("APPROVED");
    const nextAttempt = {
      id: "verification-next",
      companyId: "company-1",
      status: "PENDING",
      submittedAt: new Date("2026-08-03T00:00:00.000Z"),
    };
    mocks.companyFindUnique.mockResolvedValue(company);
    const transactionClient = {
      companyVerification: {
        update: vi.fn(() => {
          throw new Error("terminal verification must remain immutable");
        }),
        create: vi.fn().mockResolvedValue(nextAttempt),
      },
      company: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      companyDocument: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    runTransactionWith(transactionClient);

    await expect(submitCompanyVerification("company-1")).resolves.toEqual(nextAttempt);
    expect(transactionClient.companyVerification.update).not.toHaveBeenCalled();
    expect(transactionClient.companyVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: "company-1", status: "PENDING" }),
    });
    expect(transactionClient.company.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "company-1",
        status: company.status,
        verificationStatus: "APPROVED",
        isBlocked: false,
      }),
      data: { status: "PENDING_REVIEW", verificationStatus: "PENDING" },
    });
    expect(transactionClient.companyDocument.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        verificationId: "verification-next",
        status: "UPLOADED",
      },
      data: { status: "UNDER_REVIEW" },
    });
  });

  it("loses a submission race to a concurrent company state decision", async () => {
    const company = verificationContext("REJECTED");
    mocks.companyFindUnique.mockResolvedValue(company);
    const documentUpdate = vi.fn().mockResolvedValue({ count: 0 });
    const transactionClient = {
      companyVerification: {
        create: vi.fn().mockResolvedValue({
          id: "verification-next",
          companyId: "company-1",
          status: "PENDING",
        }),
      },
      company: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      companyDocument: { updateMany: documentUpdate },
    };
    runTransactionWith(transactionClient);

    await expect(submitCompanyVerification("company-1")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it("treats a repeated pending submission as an immutable idempotent read", async () => {
    const company = verificationContext("PENDING");
    mocks.companyFindUnique.mockResolvedValue(company);

    const result = await submitCompanyVerification("company-1");

    expect(result).toEqual(company.verifications[0]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
