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
vi.mock("@/lib/services/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

import {
  activateCompany,
  submitCompanyVerification,
} from "@/lib/services/verification";

type Document = {
  type: string;
  status: string;
  antivirusStatus: string;
  uploadedAt: Date;
};

function lifecycleContext(overrides: Record<string, unknown> = {}, documents?: Document[]) {
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
    status: "PENDING_REVIEW",
    verificationStatus: "APPROVED",
    isBlocked: false,
    legalAcceptances: [{ type: "OFFER" }, { type: "PRIVACY" }],
    documents: documents ?? [
      { type: "REGISTRATION", status: "APPROVED", antivirusStatus: "CLEAN", uploadedAt: new Date("2026-08-05T00:00:00.000Z") },
      { type: "REGISTRATION", status: "REUPLOAD_REQUESTED", antivirusStatus: "CLEAN", uploadedAt: new Date("2026-08-01T00:00:00.000Z") },
    ],
    subscriptions: [{ id: "subscription-1" }],
    invoices: [{ id: "invoice-1" }],
    payments: [{ status: "CONFIRMED" }],
    verifications: [{ id: "verification-2", companyId: "company-1", status: "APPROVED" }],
    ...overrides,
  };
}

function runTransactionWith(transactionClient: object) {
  mocks.transaction.mockImplementationOnce(
    async (callback: (client: object) => Promise<unknown>) => callback(transactionClient),
  );
}

describe("company activation over superseded documents", () => {
  beforeEach(() => vi.resetAllMocks());

  it("activates once a re-requested document was replaced by a newer approved upload", async () => {
    mocks.companyFindUnique.mockResolvedValue(lifecycleContext());
    const client = {
      company: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "company-1", status: "ACTIVE", isBlocked: false }),
      },
    };
    runTransactionWith(client);

    await expect(activateCompany("company-1", "admin-1", { ipAddress: "10.0.0.1" })).resolves.toMatchObject({ status: "ACTIVE" });
    expect(client.company.updateMany).toHaveBeenCalledWith({
      where: { id: "company-1", verificationStatus: "APPROVED", isBlocked: false, status: { not: "BLOCKED" } },
      data: { status: "ACTIVE", isBlocked: false },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMPANY_ACTIVATED", adminUserId: "admin-1", ipAddress: "10.0.0.1" }),
      client,
    );
  });

  it("still refuses activation while the current document of a type is rejected", async () => {
    mocks.companyFindUnique.mockResolvedValue(lifecycleContext({}, [
      { type: "REGISTRATION", status: "REJECTED", antivirusStatus: "CLEAN", uploadedAt: new Date("2026-08-05T00:00:00.000Z") },
      { type: "REGISTRATION", status: "APPROVED", antivirusStatus: "CLEAN", uploadedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]));

    await expect(activateCompany("company-1", "admin-1")).rejects.toMatchObject({
      status: 409,
      details: { reasons: ["Не все документы одобрены"] },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("verification resubmission of an active company", () => {
  beforeEach(() => vi.resetAllMocks());

  it("refuses to demote an active approved company to review", async () => {
    mocks.companyFindUnique.mockResolvedValue(lifecycleContext({ status: "ACTIVE", verificationStatus: "APPROVED" }));

    await expect(submitCompanyVerification("company-1")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Компания уже проверена и активна: повторная отправка на проверку недоступна",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["REJECTED", "PENDING_REVIEW"],
    ["REUPLOAD_REQUESTED", "PENDING_REVIEW"],
    ["APPROVED", "PENDING_REVIEW"],
  ])("still opens a new attempt after a %s decision on a %s company", async (verificationStatus, status) => {
    mocks.companyFindUnique.mockResolvedValue(lifecycleContext({
      status,
      verificationStatus,
      payments: [{ status: "PROOF_UPLOADED" }],
      verifications: [{ id: "verification-1", companyId: "company-1", status: verificationStatus }],
    }));
    const nextAttempt = { id: "verification-2", companyId: "company-1", status: "PENDING" };
    const client = {
      companyVerification: { create: vi.fn().mockResolvedValue(nextAttempt) },
      company: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      companyDocument: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    runTransactionWith(client);

    await expect(submitCompanyVerification("company-1")).resolves.toEqual(nextAttempt);
    expect(client.company.updateMany).toHaveBeenCalledWith({
      where: { id: "company-1", status, verificationStatus, isBlocked: false },
      data: { status: "PENDING_REVIEW", verificationStatus: "PENDING" },
    });
  });
});
