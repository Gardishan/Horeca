import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  companyFindUnique: vi.fn(),
  writeAuditLog: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    company: { findUnique: mocks.companyFindUnique },
  },
}));
vi.mock("@/lib/services/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));

import {
  activateCompany,
  blockCompany,
  submitCompanyVerification,
  unblockCompany,
} from "@/lib/services/verification";
import { POST as unblockRoute } from "@/app/api/admin/companies/[companyId]/unblock/route";

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

function companyRow(overrides: Record<string, unknown> = {}) {
  return { id: "company-1", status: "BLOCKED", isBlocked: true, verificationStatus: "APPROVED", ...overrides };
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

  it("explains that a blocked company must be unblocked before activation", async () => {
    mocks.companyFindUnique.mockResolvedValue(lifecycleContext({ status: "BLOCKED", isBlocked: true }));

    await expect(activateCompany("company-1", "admin-1")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Компания заблокирована: сначала снимите блокировку",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
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

describe("company block", () => {
  beforeEach(() => vi.resetAllMocks());

  it("blocks with a compare-and-swap, hides published products and audits once", async () => {
    const before = companyRow({ status: "ACTIVE", isBlocked: false });
    const client = {
      company: {
        findUnique: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(companyRow()),
      },
      product: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
    };
    runTransactionWith(client);

    await expect(blockCompany("company-1", "admin-1", "incident")).resolves.toMatchObject({ status: "BLOCKED", isBlocked: true });
    expect(client.company.updateMany).toHaveBeenCalledWith({
      where: { id: "company-1", status: "ACTIVE", isBlocked: false },
      data: { status: "BLOCKED", isBlocked: true },
    });
    expect(client.product.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", status: "PUBLISHED" },
      data: { status: "INACTIVE" },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "COMPANY_BLOCKED",
        before: { status: "ACTIVE", isBlocked: false },
        after: { status: "BLOCKED", isBlocked: true, comment: "incident" },
      }),
      client,
    );
  });

  it("treats a repeated block as idempotent without a second audit row", async () => {
    const blocked = companyRow();
    const client = {
      company: { findUnique: vi.fn().mockResolvedValue(blocked), updateMany: vi.fn() },
      product: { updateMany: vi.fn() },
    };
    runTransactionWith(client);

    await expect(blockCompany("company-1", "admin-1", "repeat")).resolves.toBe(blocked);
    expect(client.company.updateMany).not.toHaveBeenCalled();
    expect(client.product.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns idempotently when a concurrent block wins the race", async () => {
    const client = {
      company: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(companyRow({ status: "ACTIVE", isBlocked: false }))
          .mockResolvedValueOnce(companyRow()),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      product: { updateMany: vi.fn() },
    };
    runTransactionWith(client);

    await expect(blockCompany("company-1", "admin-1", "incident")).resolves.toMatchObject({ status: "BLOCKED" });
    expect(client.product.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses a block that lost the race to a different transition", async () => {
    const client = {
      company: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(companyRow({ status: "ACTIVE", isBlocked: false }))
          .mockResolvedValueOnce(companyRow({ status: "PENDING_REVIEW", isBlocked: false })),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      product: { updateMany: vi.fn() },
    };
    runTransactionWith(client);

    await expect(blockCompany("company-1", "admin-1", "incident")).rejects.toMatchObject({ status: 409 });
    expect(client.product.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("requires a reason before touching the company", async () => {
    await expect(blockCompany("company-1", "admin-1", "  ")).rejects.toMatchObject({ status: 409 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("company unblock", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["APPROVED", "PENDING_REVIEW"],
    ["PENDING", "PENDING_REVIEW"],
    ["NOT_STARTED", "DRAFT"],
  ])("returns a blocked company with %s verification to %s without activating it", async (verificationStatus, target) => {
    const before = companyRow({ verificationStatus });
    const after = companyRow({ verificationStatus, status: target, isBlocked: false });
    const client = {
      company: {
        findUnique: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(after),
      },
      product: { updateMany: vi.fn() },
    };
    runTransactionWith(client);

    const result = await unblockCompany("company-1", "admin-1", "restored", { ipAddress: "10.0.0.2" });

    expect(result).toBe(after);
    expect(client.company.updateMany).toHaveBeenCalledWith({
      where: { id: "company-1", status: "BLOCKED", isBlocked: true, verificationStatus },
      data: { status: target, isBlocked: false },
    });
    expect(client.product.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      {
        adminUserId: "admin-1",
        companyId: "company-1",
        action: "COMPANY_UNBLOCKED",
        entityType: "Company",
        entityId: "company-1",
        before: { status: "BLOCKED", isBlocked: true },
        after: { status: target, isBlocked: false, comment: "restored" },
        ipAddress: "10.0.0.2",
      },
      client,
    );
  });

  it("is idempotent for a company that is no longer blocked", async () => {
    const active = companyRow({ status: "ACTIVE", isBlocked: false });
    const client = { company: { findUnique: vi.fn().mockResolvedValue(active), updateMany: vi.fn() } };
    runTransactionWith(client);

    await expect(unblockCompany("company-1", "admin-1", "repeat")).resolves.toBe(active);
    expect(client.company.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns idempotently when a concurrent unblock wins and refuses any other race", async () => {
    const unblocked = companyRow({ status: "PENDING_REVIEW", isBlocked: false });
    runTransactionWith({
      company: {
        findUnique: vi.fn().mockResolvedValueOnce(companyRow()).mockResolvedValueOnce(unblocked),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await expect(unblockCompany("company-1", "admin-1", "restored")).resolves.toBe(unblocked);

    runTransactionWith({
      company: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(companyRow())
          .mockResolvedValueOnce(companyRow({ verificationStatus: "PENDING" })),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await expect(unblockCompany("company-1", "admin-1", "restored")).rejects.toMatchObject({ status: 409 });
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("requires a reason and an existing company", async () => {
    await expect(unblockCompany("company-1", "admin-1", "")).rejects.toMatchObject({
      status: 409,
      message: "Укажите причину разблокировки",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();

    runTransactionWith({ company: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(unblockCompany("missing", "admin-1", "restored")).rejects.toMatchObject({ status: 404 });
  });
});

describe("POST /api/admin/companies/[companyId]/unblock", () => {
  const origin = "https://horeca.example";
  const params = { params: Promise.resolve({ companyId: "company-1" }) };

  function unblockRequest(headers: Record<string, string> = { Origin: origin }, body = JSON.stringify({ comment: "restored" })) {
    return new Request(`${origin}/api/admin/companies/company-1/unblock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  });

  it("unblocks for an admin and returns the envelope", async () => {
    const client = {
      company: {
        findUnique: vi.fn().mockResolvedValue(companyRow()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(companyRow({ status: "PENDING_REVIEW", isBlocked: false })),
      },
    };
    runTransactionWith(client);

    const response = await unblockRoute(unblockRequest({ Origin: origin, "X-Forwarded-For": "10.0.0.3, 10.0.0.4" }), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: companyRow({ status: "PENDING_REVIEW", isBlocked: false }),
    });
    expect(mocks.requireRole).toHaveBeenCalledWith("ADMIN");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMPANY_UNBLOCKED", adminUserId: "admin-1", ipAddress: "10.0.0.3" }),
      client,
    );
  });

  it.each([
    ["anonymous", new UnauthorizedError(), 401, "UNAUTHORIZED"],
    ["supplier", new ForbiddenError(), 403, "FORBIDDEN"],
    ["buyer", new ForbiddenError(), 403, "FORBIDDEN"],
  ])("denies %s callers before any company read", async (_role, error, status, code) => {
    mocks.requireRole.mockRejectedValue(error);

    const response = await unblockRoute(unblockRequest(), params);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code } });
    expect(mocks.requireRole).toHaveBeenCalledWith("ADMIN");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    ["missing Origin", {}],
    ["cross-site Origin", { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" }],
    ["foreign Origin", { Origin: "https://attacker.example" }],
  ])("rejects a %s before authentication", async (_case, headers) => {
    const response = await unblockRoute(unblockRequest(headers), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "CSRF_REJECTED" } });
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing reason and malformed JSON without writing", async () => {
    const missingReason = await unblockRoute(unblockRequest({ Origin: origin }, "{}"), params);
    expect(missingReason.status).toBe(409);
    await expect(missingReason.json()).resolves.toMatchObject({ ok: false, error: { message: "Укажите причину разблокировки" } });

    const malformed = await unblockRoute(unblockRequest({ Origin: origin }, "{"), params);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ ok: false, error: { code: "INVALID_JSON" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
