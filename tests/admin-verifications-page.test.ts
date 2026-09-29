import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ForbiddenError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  listAdminVerifications: vi.fn(),
  listAdminPendingPayments: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/services/admin", () => ({
  ADMIN_QUEUE_LIMIT: 3,
  listAdminVerifications: mocks.listAdminVerifications,
  listAdminPendingPayments: mocks.listAdminPendingPayments,
}));

import AdminVerificationsPage from "@/app/admin/verifications/page";

function queuedPayment(id: string, subscriptionStatus = "PENDING_PAYMENT", hasProof = true) {
  return {
    id,
    amount: "75000",
    currency: "KZT",
    method: "MANUAL_BANK_TRANSFER",
    status: "PROOF_UPLOADED",
    hasProof,
    paidAt: new Date("2026-09-20T08:00:00.000Z"),
    createdAt: new Date("2026-09-20T07:00:00.000Z"),
    updatedAt: new Date("2026-09-20T08:00:00.000Z"),
    company: { id: `company-${id}`, name: `Supplier ${id}`, binIin: "220540012345", status: "ACTIVE" },
    invoice: {
      id: `invoice-${id}`,
      invoiceNumber: `HKZ-${id}`,
      status: "PAID_PENDING_CONFIRMATION",
      subscription: { id: `subscription-${id}`, status: subscriptionStatus, plan: { code: "PREMIUM", name: "PREMIUM" } },
    },
  };
}

function document(id: string, status: string) {
  return {
    id,
    type: "REGISTRATION",
    originalName: `${id}.pdf`,
    status,
    antivirusStatus: "SKIPPED_MOCK",
    uploadedAt: new Date("2026-09-20T07:00:00.000Z"),
    adminComment: null,
  };
}

function pendingVerification(overrides: Record<string, unknown> = {}) {
  return {
    id: "verification-v2",
    companyId: "company-pending",
    status: "PENDING",
    submittedAt: new Date("2026-09-21T07:00:00.000Z"),
    reviewedAt: null,
    adminComment: null,
    createdAt: new Date("2026-09-21T06:00:00.000Z"),
    company: { id: "company-pending", name: "Fresh Horeca Distribution", binIin: "240140067890", city: "Алматы" },
    documents: [document("doc-v2-registration", "UNDER_REVIEW"), document("doc-v2-bank", "APPROVED")],
    earlierDocuments: [],
    subscription: { id: "subscription-start", status: "PENDING_PAYMENT", plan: { code: "START", name: "START" } },
    invoice: { id: "invoice-start", invoiceNumber: "HKZ-START", status: "PAID_PENDING_CONFIRMATION" },
    payment: {
      id: "payment-start",
      companyId: "company-pending",
      invoiceId: "invoice-start",
      amount: "15000",
      currency: "KZT",
      method: "MANUAL_BANK_TRANSFER",
      status: "PROOF_UPLOADED",
      hasProof: true,
      adminComment: null,
      paidAt: null,
      confirmedAt: null,
      createdAt: new Date("2026-09-21T06:30:00.000Z"),
      updatedAt: new Date("2026-09-21T06:30:00.000Z"),
    },
    ...overrides,
  };
}

async function render() {
  return renderToStaticMarkup(await AdminVerificationsPage());
}

function count(html: string, text: string) {
  return html.split(text).length - 1;
}

describe("admin verification and payment review page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.listAdminVerifications.mockResolvedValue([]);
    mocks.listAdminPendingPayments.mockResolvedValue([]);
  });

  it("requires the ADMIN role before reading any review queue", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError());

    await expect(AdminVerificationsPage()).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.requireRole).toHaveBeenCalledWith("ADMIN");
    expect(mocks.listAdminVerifications).not.toHaveBeenCalled();
    expect(mocks.listAdminPendingPayments).not.toHaveBeenCalled();
  });

  it("makes an upgrade proof reviewable without any pending verification", async () => {
    mocks.listAdminPendingPayments.mockResolvedValue([queuedPayment("payment-upgrade")]);

    const html = await render();

    expect(mocks.listAdminVerifications).toHaveBeenCalledWith();
    expect(html).toContain("Нет компаний, ожидающих проверки.");
    expect(html).toContain("Оплаты на проверке");
    expect(html).toContain("Supplier payment-upgrade");
    expect(html).toContain("HKZ-payment-upgrade");
    expect(html).toContain("PREMIUM");
    expect(html).toContain('href="/api/admin/payments/payment-upgrade/proof"');
    expect(html).toContain('href="/admin/company/company-payment-upgrade"');
    expect(count(html, "Подтвердить оплату")).toBe(1);
    expect(count(html, "Отклонить оплату")).toBe(1);
    expect(html).not.toContain("proofFilePath");
  });

  it("offers only rejection when the invoiced plan no longer awaits payment", async () => {
    mocks.listAdminPendingPayments.mockResolvedValue([queuedPayment("payment-superseded", "CANCELLED")]);

    const html = await render();

    expect(html).toContain("Тариф больше не ожидает оплату");
    expect(count(html, "Подтвердить оплату")).toBe(0);
    expect(count(html, "Отклонить оплату")).toBe(1);
  });

  it("omits the proof link when no proof file is stored", async () => {
    mocks.listAdminPendingPayments.mockResolvedValue([queuedPayment("payment-no-file", "PENDING_PAYMENT", false)]);

    const html = await render();

    expect(html).not.toContain("/api/admin/payments/payment-no-file/proof");
    expect(html).toContain("Файл не загружен");
  });

  it("renders both empty states when nothing awaits a decision", async () => {
    const html = await render();

    expect(html).toContain("Нет компаний, ожидающих проверки.");
    expect(html).toContain("Нет оплат, ожидающих решения.");
    expect(html).not.toContain("Подтвердить оплату");
    expect(html).not.toContain("Показаны первые");
  });

  it("states when a queue is truncated at its bound", async () => {
    mocks.listAdminPendingPayments.mockResolvedValue([queuedPayment("a"), queuedPayment("b"), queuedPayment("c")]);
    mocks.listAdminVerifications.mockResolvedValue([
      pendingVerification({ id: "v-a" }),
      pendingVerification({ id: "v-b" }),
      pendingVerification({ id: "v-c" }),
    ]);

    const html = await render();

    expect(count(html, "Показаны первые 3")).toBe(2);
  });

  it("offers document decisions only for documents under review in the attempt", async () => {
    mocks.listAdminVerifications.mockResolvedValue([pendingVerification()]);

    const html = await render();

    expect(html).toContain('href="/api/admin/documents/doc-v2-registration/download"');
    expect(html).toContain('href="/api/admin/documents/doc-v2-bank/download"');
    expect(count(html, "Перезагрузить")).toBe(1);
    expect(count(html, ">Отклонить<")).toBe(2);
    expect(html).not.toContain("Документы предыдущих попыток");
  });

  it("shows earlier approved documents read-only and keeps undecided ones actionable", async () => {
    mocks.listAdminVerifications.mockResolvedValue([
      pendingVerification({
        documents: [document("doc-v2-registration", "APPROVED")],
        earlierDocuments: [document("doc-v1-certificate", "APPROVED"), document("doc-v1-license", "UNDER_REVIEW")],
      }),
    ]);

    const html = await render();

    expect(html).toContain("Документы предыдущих попыток");
    expect(html).toContain('href="/api/admin/documents/doc-v1-certificate/download"');
    expect(html).toContain('href="/api/admin/documents/doc-v1-license/download"');
    expect(count(html, "Перезагрузить")).toBe(1);
  });

  it("shows the attempt without documents instead of company-wide files", async () => {
    mocks.listAdminVerifications.mockResolvedValue([pendingVerification({ documents: [] })]);

    const html = await render();

    expect(html).toContain("В этой попытке нет документов");
    expect(count(html, "Перезагрузить")).toBe(0);
  });

  it("binds the card payment to the current subscription invoice", async () => {
    mocks.listAdminVerifications.mockResolvedValue([pendingVerification()]);

    const html = await render();

    expect(html).toContain("START");
    expect(html).toContain("HKZ-START");
    expect(html).toContain('href="/api/admin/payments/payment-start/proof"');
    expect(count(html, "Подтвердить оплату")).toBe(1);
    expect(count(html, "Отклонить оплату")).toBe(1);
    expect(html).toContain("Запросить документы");
  });

  it("hides payment decisions on the card until a proof awaits decision", async () => {
    const verification = pendingVerification();
    mocks.listAdminVerifications.mockResolvedValue([
      pendingVerification({ payment: { ...verification.payment, status: "PENDING", hasProof: false } }),
    ]);

    const html = await render();

    expect(html).not.toContain("/api/admin/payments/payment-start/proof");
    expect(count(html, "Подтвердить оплату")).toBe(0);
    expect(count(html, "Отклонить оплату")).toBe(0);
  });

  it("explains a missing invoice and plan on the card", async () => {
    mocks.listAdminVerifications.mockResolvedValue([pendingVerification({ subscription: null, invoice: null, payment: null })]);

    const html = await render();

    expect(html).toContain("Тариф: не выбран");
    expect(html).toContain("Счёт не сформирован");
    expect(count(html, "Подтвердить оплату")).toBe(0);
  });
});
