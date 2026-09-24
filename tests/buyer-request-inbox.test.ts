import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  companyFindUnique: vi.fn(),
  requestFindMany: vi.fn(),
  requestCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: mocks.companyFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { listSupplierBuyerRequests } from "@/lib/services/buyer-requests";
import { GET } from "@/app/api/dashboard/requests/route";

const request = {
  id: "request-1",
  buyerName: "Demo Buyer",
  buyerCompany: "Demo Cafe",
  phone: "+77010000000",
  email: "buyer@example.test",
  message: "Прошу направить демонстрационное предложение.",
  quantity: 5,
  status: "NEW",
  createdAt: new Date("2026-09-24T07:00:00.000Z"),
  product: { id: "product-1", name: "Demo Coffee", unit: "KG" },
};

describe("supplier buyer-request inbox", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "supplier-1", role: "SUPPLIER" });
    mocks.companyFindUnique.mockResolvedValue({ id: "company-1" });
    mocks.requestCount.mockResolvedValue(1);
    mocks.requestFindMany.mockResolvedValue([request]);
    mocks.transaction.mockImplementation(async (callback) => callback({
      buyerRequest: { findMany: mocks.requestFindMany, count: mocks.requestCount },
    }));
  });

  it("delivers buyer contacts, message and product only from the authenticated supplier company", async () => {
    const result = await listSupplierBuyerRequests();

    expect(mocks.requireRole).toHaveBeenCalledWith("SUPPLIER");
    expect(mocks.companyFindUnique).toHaveBeenCalledWith({
      where: { ownerId: "supplier-1" },
      select: { id: true },
    });
    expect(mocks.requestCount).toHaveBeenCalledWith({ where: { companyId: "company-1" } });
    expect(mocks.requestFindMany).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      select: {
        id: true,
        buyerName: true,
        buyerCompany: true,
        phone: true,
        email: true,
        message: true,
        quantity: true,
        status: true,
        createdAt: true,
        product: { select: { id: true, name: true, unit: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 24,
    });
    expect(result).toEqual({
      items: [request],
      pagination: { page: 1, pageSize: 24, total: 1, pages: 1 },
    });
  });

  it("keeps requests belonging to another supplier out of both list and count", async () => {
    mocks.companyFindUnique.mockResolvedValue({ id: "company-2" });
    mocks.requestFindMany.mockImplementation(async ({ where }) => where.companyId === "company-1" ? [request] : []);
    mocks.requestCount.mockImplementation(async ({ where }) => where.companyId === "company-1" ? 1 : 0);

    await expect(listSupplierBuyerRequests()).resolves.toEqual({
      items: [],
      pagination: { page: 1, pageSize: 24, total: 0, pages: 1 },
    });
    expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-2" } }));
  });

  it("paginates at 24 requests and returns an empty out-of-range page", async () => {
    mocks.requestCount.mockResolvedValue(25);
    const second = await listSupplierBuyerRequests("2");
    expect(second.pagination).toEqual({ page: 2, pageSize: 24, total: 25, pages: 2 });
    expect(mocks.requestFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 24, take: 24 }));

    mocks.requestFindMany.mockResolvedValue([]);
    const beyondLast = await listSupplierBuyerRequests("3");
    expect(beyondLast.items).toEqual([]);
    expect(beyondLast.pagination).toEqual({ page: 3, pageSize: 24, total: 25, pages: 2 });
    expect(mocks.requestFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 48, take: 24 }));
  });

  it.each(["0", "-1", "1.5", "bad", "Infinity", "", ["1", "2"], String(Number.MAX_SAFE_INTEGER), "89478487"])("rejects invalid page %j before reading contacts", async (page) => {
    await expect(listSupplierBuyerRequests(page)).rejects.toMatchObject({ name: "ZodError" });
    expect(mocks.requestFindMany).not.toHaveBeenCalled();
  });

  it("denies suppliers without a company", async () => {
    mocks.companyFindUnique.mockResolvedValue(null);
    await expect(listSupplierBuyerRequests()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["anonymous", new UnauthorizedError(), 401],
    ["admin", new ForbiddenError(), 403],
    ["buyer", new ForbiddenError(), 403],
  ])("denies %s before querying requests", async (_role, error, status) => {
    mocks.requireRole.mockRejectedValue(error);
    const response = await GET(new Request("https://horeca.example/api/dashboard/requests"));
    expect(response.status).toBe(status);
    expect(mocks.requireRole).toHaveBeenCalledWith("SUPPLIER");
    expect(mocks.companyFindUnique).not.toHaveBeenCalled();
    expect(mocks.requestFindMany).not.toHaveBeenCalled();
  });

  it("returns the HTTP envelope and ignores a client-supplied company selector", async () => {
    const response = await GET(new Request("https://horeca.example/api/dashboard/requests?companyId=company-2"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { items: [{ id: "request-1", email: "buyer@example.test" }], pagination: { total: 1 } },
    });
    expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-1" } }));
  });

  it("returns a validation envelope for invalid pagination", async () => {
    const response = await GET(new Request("https://horeca.example/api/dashboard/requests?page=nope"));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.requestFindMany).not.toHaveBeenCalled();
  });

  it("does not disclose database details if loading the inbox fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requestFindMany.mockRejectedValue(new Error("private database detail"));
    const response = await GET(new Request("https://horeca.example/api/dashboard/requests"));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("private database detail");
    expect(body).toContain('"code":"INTERNAL_ERROR"');
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
