import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { product: { findMany: mocks.findMany, count: mocks.count }, $transaction: mocks.transaction },
}));

import { GET } from "@/app/api/catalog/products/route";
import { listPublicProducts } from "@/lib/services/catalog";

describe("catalog query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockResolvedValue([[], 0]);
  });

  it.each(["page=abc", "page=1.5", "page=Infinity", "page=9007199254740991", "pageSize=no", "pageSize=2.5", "availability=INVALID"])(
    "rejects %s before a database query",
    async (query) => {
      const response = await GET(new Request(`http://localhost/api/catalog/products?${query}`));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
      expect(mocks.findMany).not.toHaveBeenCalled();
    },
  );

  it("accepts empty form filters and preserves established pagination defaults", async () => {
    const response = await GET(new Request("http://localhost/api/catalog/products?availability=&category=&city="));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 24, skip: 0 }));
    expect(await response.json()).toMatchObject({ data: { pagination: { page: 1, pageSize: 24 } } });
  });

  it("preserves valid filters, pagination and the public trust policy", async () => {
    await GET(new Request("http://localhost/api/catalog/products?page=2&pageSize=10&availability=IN_STOCK&city=Almaty"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10,
      where: expect.objectContaining({ status: "PUBLISHED", availabilityStatus: "IN_STOCK", deliveryCities: { has: "Almaty" }, company: expect.objectContaining({ status: "ACTIVE", verificationStatus: "APPROVED", isBlocked: false }) }),
    }));
  });

  it("keeps existing integer clamps for page and page size", async () => {
    expect((await listPublicProducts({ page: 0, pageSize: 100 })).pagination).toMatchObject({ page: 1, pageSize: 60 });
  });

  it("also protects direct service callers against invalid pagination", async () => {
    await expect(listPublicProducts({ page: Number.NaN })).rejects.toThrow();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
