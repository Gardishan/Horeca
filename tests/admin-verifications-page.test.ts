import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ForbiddenError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  listAdminVerifications: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/services/admin", () => ({
  ADMIN_QUEUE_LIMIT: 3,
  listAdminVerifications: mocks.listAdminVerifications,
}));

import AdminVerificationsPage from "@/app/admin/verifications/page";

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
    company: {
      id: "company-pending",
      name: "Fresh Horeca Distribution",
      binIin: "240140067890",
      city: "Алматы",
      payments: [{ id: "payment-start", status: "PROOF_UPLOADED", hasProof: true }],
      subscriptions: [{ id: "subscription-start", status: "PENDING_PAYMENT", plan: { code: "START", name: "START" } }],
    },
    documents: [document("doc-v2-registration", "UNDER_REVIEW"), document("doc-v2-bank", "APPROVED")],
    earlierDocuments: [],
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
  });

  it("requires the ADMIN role before reading any review queue", async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError());

    await expect(AdminVerificationsPage()).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.requireRole).toHaveBeenCalledWith("ADMIN");
    expect(mocks.listAdminVerifications).not.toHaveBeenCalled();
  });

  it("renders the empty state when no attempt awaits a decision", async () => {
    const html = await render();

    expect(mocks.listAdminVerifications).toHaveBeenCalledWith();
    expect(html).toContain("Нет компаний, ожидающих проверки.");
    expect(html).not.toContain("Показаны первые");
  });

  it("states when a queue is truncated at its bound", async () => {
    mocks.listAdminVerifications.mockResolvedValue([
      pendingVerification({ id: "v-a" }),
      pendingVerification({ id: "v-b" }),
      pendingVerification({ id: "v-c" }),
    ]);

    const html = await render();

    expect(count(html, "Показаны первые 3")).toBe(1);
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

});
