import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ getCompanyBilling: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/auth", () => ({
  requireSupplierCompany: vi.fn().mockResolvedValue({ company: { id: "company-1" } }),
}));
vi.mock("@/lib/services/billing", () => ({ getCompanyBilling: mocks.getCompanyBilling }));
vi.mock("@/lib/beta-safety", () => ({ isBetaDemoOnly: () => true }));

import BillingPage from "@/app/dashboard/company/billing/page";

function invoice(id: string, subscriptionId: string, status = "PAID") {
  return { id, subscriptionId, invoiceNumber: id, status, amount: "10000", currency: "KZT", payments: [] };
}

describe("supplier billing invoice selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers a new invoice after selecting another plan despite an older paid invoice", async () => {
    mocks.getCompanyBilling.mockResolvedValue({
      plans: [], history: [],
      subscriptions: [
        { id: "new-subscription", status: "PENDING_PAYMENT", plan: { code: "PRO" } },
        { id: "active-subscription", status: "ACTIVE", plan: { code: "START" } },
      ],
      invoices: [invoice("OLD-INVOICE", "active-subscription")],
    });

    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Сформировать счёт");
    expect(html).not.toContain("OLD-INVOICE");
    expect(html).not.toContain("Я оплатил");
  });

  it("shows only the invoice belonging to the pending subscription", async () => {
    mocks.getCompanyBilling.mockResolvedValue({
      plans: [], history: [],
      subscriptions: [
        { id: "pending-subscription", status: "PENDING_PAYMENT", plan: { code: "PRO" } },
        { id: "old-subscription", status: "CANCELLED", plan: { code: "START" } },
      ],
      invoices: [
        invoice("OLD-INVOICE", "old-subscription", "ISSUED"),
        invoice("PENDING-INVOICE", "pending-subscription", "ISSUED"),
      ],
    });

    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("PENDING-INVOICE");
    expect(html).not.toContain("OLD-INVOICE");
    expect(html).toContain("Я оплатил");
    expect(html).not.toContain("Сформировать счёт");
  });

  it("keeps an active subscription invoice visible without payment mutations", async () => {
    mocks.getCompanyBilling.mockResolvedValue({
      plans: [], history: [],
      subscriptions: [{ id: "active-subscription", status: "ACTIVE", plan: { code: "START" } }],
      invoices: [invoice("PAID-INVOICE", "active-subscription")],
    });

    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("PAID-INVOICE");
    expect(html).not.toContain("Я оплатил");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Сформировать счёт");
  });
});
