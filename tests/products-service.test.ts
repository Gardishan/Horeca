import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  productFindFirst: vi.fn(),
  productFindUnique: vi.fn(),
  productFindUniqueOrThrow: vi.fn(),
  productCount: vi.fn(),
  productCreate: vi.fn(),
  productUpdate: vi.fn(),
  productUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { Prisma } from "@prisma/client";
import {
  adminCreateProduct,
  adminPublishProduct,
  adminSetProductStatus,
  adminUpdateProduct,
  hideCompanyProduct,
  publishCompanyProduct,
  updateCompanyProduct,
} from "@/lib/services/products";
import { ConflictError, NotFoundError } from "@/lib/errors";

// Журнал пишется только через транзакционный клиент: у глобального prisma-мока
// нет adminAuditLog, поэтому запись вне транзакции упала бы.
const transactionClient = {
  product: {
    findFirst: mocks.productFindFirst,
    findUnique: mocks.productFindUnique,
    findUniqueOrThrow: mocks.productFindUniqueOrThrow,
    count: mocks.productCount,
    create: mocks.productCreate,
    update: mocks.productUpdate,
    updateMany: mocks.productUpdateMany,
  },
  adminAuditLog: { create: mocks.auditCreate },
};

function runTransaction() {
  mocks.transaction.mockImplementationOnce(
    async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
}

type SubscriptionShape = {
  status: "ACTIVE";
  plan: { maxProducts: number | null };
  invoices: { payments: { status: "CONFIRMED" }[] }[];
};

/**
 * Форма, которую возвращает tx.product.findFirst из publishCompanyProduct.
 * Prisma-запрос уже отфильтровал подписку (ACTIVE и не просроченная), счёт (PAID)
 * и платёж (CONFIRMED), поэтому отсутствие подписки моделируется пустым массивом.
 */
function productRecord(options: {
  maxProducts?: number | null;
  withSubscription?: boolean;
  companyStatus?: "ACTIVE" | "DRAFT" | "PENDING_REVIEW";
  verificationStatus?: "APPROVED" | "PENDING" | "REJECTED";
  isBlocked?: boolean;
  productStatus?: "DRAFT" | "PUBLISHED" | "INACTIVE" | "BLOCKED";
}) {
  const subscription: SubscriptionShape = {
    status: "ACTIVE",
    plan: { maxProducts: options.maxProducts ?? null },
    invoices: [{ payments: [{ status: "CONFIRMED" }] }],
  };
  return {
    id: "product-1",
    companyId: "company-1",
    status: options.productStatus ?? "DRAFT",
    company: {
      status: options.companyStatus ?? "ACTIVE",
      verificationStatus: options.verificationStatus ?? "APPROVED",
      isBlocked: options.isBlocked ?? false,
      subscriptions: options.withSubscription === false ? [] : [subscription],
    },
  };
}

async function publishExpectingConflict() {
  return publishCompanyProduct("company-1", "product-1").catch((error: unknown) => error);
}

describe("publishCompanyProduct plan limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productUpdateMany.mockResolvedValue({ count: 1 });
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "PUBLISHED" });
  });

  // Регрессия: сервис строил вход правила как `subscription?.plan.maxProducts ?? 0`,
  // из-за чего PREMIUM ("Безлимитные товары", maxProducts = null) коэрсился в жёсткий 0
  // и самый дорогой тариф не мог опубликовать ни одного товара.
  // Доменный тест этого не ловит: evaluateProductPublication всегда обрабатывал null верно,
  // ошибка жила только в отображении подписки на вход правила.
  it("keeps an existing subscription with a null plan limit unlimited", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: null }));
    mocks.productCount.mockResolvedValue(5_000);

    await expect(publishCompanyProduct("company-1", "product-1")).resolves.toEqual({
      id: "product-1",
      status: "PUBLISHED",
    });
    expect(mocks.productUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PUBLISHED" } }),
    );
  });

  it("does not treat a missing subscription as unlimited", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ withSubscription: false }));
    mocks.productCount.mockResolvedValue(0);

    const error = await publishExpectingConflict();

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toMatchObject({
      reasons: expect.arrayContaining([expect.stringContaining("Лимит тарифа")]),
    });
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
  });

  it("still refuses publication once a finite plan limit is reached", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10 }));
    mocks.productCount.mockResolvedValue(10);

    const error = await publishExpectingConflict();

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toMatchObject({
      reasons: expect.arrayContaining([expect.stringContaining("максимум 10 товаров")]),
    });
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
  });

  it("allows publication below a finite plan limit", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10 }));
    mocks.productCount.mockResolvedValue(9);

    await expect(publishCompanyProduct("company-1", "product-1")).resolves.toMatchObject({
      status: "PUBLISHED",
    });
  });

  it("stays idempotent for an already published product at capacity", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(
      productRecord({ maxProducts: 10, productStatus: "PUBLISHED" }),
    );
    mocks.productCount.mockResolvedValue(10);

    await expect(publishCompanyProduct("company-1", "product-1")).resolves.toMatchObject({
      status: "PUBLISHED",
    });
  });

  it("keeps refusing a blocked, inactive or unverified company even when the plan is unlimited", async () => {
    const cases = [
      { label: "blocked", record: productRecord({ maxProducts: null, isBlocked: true }), reason: "заблокирована" },
      { label: "inactive", record: productRecord({ maxProducts: null, companyStatus: "DRAFT" }), reason: "не активирована" },
      { label: "unverified", record: productRecord({ maxProducts: null, verificationStatus: "PENDING" }), reason: "не одобрена" },
    ];

    for (const { label, record, reason } of cases) {
      vi.clearAllMocks();
      runTransaction();
      mocks.productFindFirst.mockResolvedValue(record);
      mocks.productCount.mockResolvedValue(0);

      const error = await publishExpectingConflict();

      expect(error, label).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details, label).toMatchObject({
        reasons: expect.arrayContaining([expect.stringContaining(reason)]),
      });
      expect(mocks.productUpdateMany, label).not.toHaveBeenCalled();
    }
  });

  it("refuses a product owned by another company before any plan check", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(null);

    const error = await publishExpectingConflict();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(mocks.productCount).not.toHaveBeenCalled();
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
  });

  // Просроченная, неактивная и неоплаченная подписка отсекаются на уровне запроса,
  // а не правилом. Если этот фильтр ослабить, оплата и срок действия перестанут
  // ограничивать публикацию, поэтому условие проверяется явно.
  it("scopes the subscription lookup to the paid, confirmed and unexpired subscription of the owning company", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10 }));
    mocks.productCount.mockResolvedValue(0);

    await publishCompanyProduct("company-1", "product-1");

    const query = mocks.productFindFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({ id: "product-1", companyId: "company-1" });

    const subscriptions = query.include.company.include.subscriptions;
    expect(subscriptions.where.status).toBe("ACTIVE");
    expect(subscriptions.where.OR).toEqual([
      { endsAt: null },
      { endsAt: { gt: expect.any(Date) } },
    ]);
    expect(subscriptions.include.invoices.where.status).toBe("PAID");
    expect(subscriptions.include.invoices.include.payments.where.status).toBe("CONFIRMED");

    expect(mocks.productCount).toHaveBeenCalledWith({
      where: { companyId: "company-1", status: "PUBLISHED" },
    });
  });
});

const supplierWrite = { id: "product-1", companyId: "company-1", status: { not: "BLOCKED" } };

function supplierProduct(status: "DRAFT" | "PUBLISHED" | "INACTIVE" | "BLOCKED") {
  return { name: "Кофе в зернах Arabica Blend 1 кг", status };
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => { throw new Error("expected the supplier action to be refused"); },
    (error: unknown) => error,
  );
}

function expectAdminBlockConflict(error: unknown) {
  expect(error).toBeInstanceOf(ConflictError);
  expect((error as ConflictError).status).toBe(409);
  expect((error as ConflictError).details).toEqual({ reasons: ["Товар заблокирован администратором"] });
}

describe("supplier cannot override an admin product block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("refuses to publish a BLOCKED product before any plan check or write", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: null, productStatus: "BLOCKED" }));
    mocks.productCount.mockResolvedValue(0);

    expectAdminBlockConflict(await rejection(publishCompanyProduct("company-1", "product-1")));
    expect(mocks.productCount).not.toHaveBeenCalled();
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });

  it("publishes an eligible DRAFT product only through a write that excludes BLOCKED", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10, productStatus: "DRAFT" }));
    mocks.productCount.mockResolvedValue(0);
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "PUBLISHED" });

    await expect(publishCompanyProduct("company-1", "product-1")).resolves.toMatchObject({ status: "PUBLISHED" });
    expect(mocks.productUpdateMany).toHaveBeenCalledWith({ where: supplierWrite, data: { status: "PUBLISHED" } });
  });

  it("does not overwrite an admin block that commits between the read and the write", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10, productStatus: "INACTIVE" }));
    mocks.productCount.mockResolvedValue(0);
    mocks.productUpdateMany.mockResolvedValue({ count: 0 });

    expectAdminBlockConflict(await rejection(publishCompanyProduct("company-1", "product-1")));
    expect(mocks.productFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("refuses to hide a BLOCKED product, which would otherwise erase the block", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("BLOCKED"));

    expectAdminBlockConflict(await rejection(hideCompanyProduct("company-1", "product-1")));
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
  });

  it("hides a published product through a company-scoped write that excludes BLOCKED", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("PUBLISHED"));
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "INACTIVE" });

    await expect(hideCompanyProduct("company-1", "product-1")).resolves.toMatchObject({ status: "INACTIVE" });
    expect(mocks.productFindFirst.mock.calls[0][0].where).toEqual({ id: "product-1", companyId: "company-1" });
    expect(mocks.productUpdateMany).toHaveBeenCalledWith({ where: supplierWrite, data: { status: "INACTIVE" } });
  });

  it("refuses a hide that loses the race against a concurrent admin block", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("PUBLISHED"));
    mocks.productUpdateMany.mockResolvedValue({ count: 0 });

    expectAdminBlockConflict(await rejection(hideCompanyProduct("company-1", "product-1")));
  });

  it("refuses to edit a BLOCKED product", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("BLOCKED"));

    expectAdminBlockConflict(await rejection(updateCompanyProduct("company-1", "product-1", { price: 1 })));
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
  });

  it("edits a non-blocked product through a company-scoped write that excludes BLOCKED", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("PUBLISHED"));
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "PUBLISHED", stock: 5 });

    await expect(updateCompanyProduct("company-1", "product-1", { stock: 5 })).resolves.toMatchObject({ stock: 5 });
    expect(mocks.productUpdateMany).toHaveBeenCalledWith({ where: supplierWrite, data: { stock: 5 } });
  });

  it("refuses an edit that loses the race against a concurrent admin block", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("DRAFT"));
    mocks.productUpdateMany.mockResolvedValue({ count: 0 });

    expectAdminBlockConflict(await rejection(updateCompanyProduct("company-1", "product-1", { stock: 5 })));
  });

  it("keeps another company's product invisible to hide and edit", async () => {
    for (const action of [
      () => hideCompanyProduct("company-2", "product-1"),
      () => updateCompanyProduct("company-2", "product-1", { stock: 5 }),
    ]) {
      vi.clearAllMocks();
      runTransaction();
      mocks.productFindFirst.mockResolvedValue(null);

      await expect(action()).rejects.toBeInstanceOf(NotFoundError);
      expect(mocks.productFindFirst.mock.calls[0][0].where).toEqual({ id: "product-1", companyId: "company-2" });
      expect(mocks.productUpdateMany).not.toHaveBeenCalled();
    }
  });
});

// Регрессия: updateCompanyProduct делал `input.name ? { slug: uniqueSlug(input.name) } : {}`,
// а форма всегда отправляет name, поэтому любое сохранение (даже правка цены) меняло
// публичный slug и ломало ссылки /catalog/<slug>.
describe("product edits keep the public slug unless the name changes", () => {
  const currentName = "Кофе в зернах Arabica Blend 1 кг";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productUpdateMany.mockResolvedValue({ count: 1 });
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", slug: "arabica-blend-1kg" });
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("keeps the slug when the supplier saves the form with an unchanged name", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("PUBLISHED"));

    await updateCompanyProduct("company-1", "product-1", { name: currentName, price: 9_100 });

    const data = mocks.productUpdateMany.mock.calls[0][0].data;
    expect(data).toEqual({ name: currentName, price: 9_100 });
    expect(data).not.toHaveProperty("slug");
  });

  it("keeps the slug when the edit does not touch the name", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("PUBLISHED"));

    await updateCompanyProduct("company-1", "product-1", { stock: 7 });

    expect(mocks.productUpdateMany.mock.calls[0][0].data).not.toHaveProperty("slug");
  });

  it("regenerates the slug when the supplier actually renames the product", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(supplierProduct("DRAFT"));

    await updateCompanyProduct("company-1", "product-1", { name: "Arabica Espresso 500 g" });

    expect(mocks.productUpdateMany.mock.calls[0][0].data.slug).toMatch(/^arabica-espresso-500-g-[0-9a-f]{8}$/);
  });

  it("keeps the slug when the admin saves with an unchanged name and regenerates it on rename", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(storedProduct({ name: currentName }));
    mocks.productUpdate.mockResolvedValue(storedProduct({ name: currentName }));

    await adminUpdateProduct("product-1", { name: currentName, isFeatured: true }, "admin-1");
    expect(mocks.productUpdate.mock.calls[0][0].data).not.toHaveProperty("slug");

    runTransaction();
    mocks.productUpdate.mockResolvedValue(storedProduct({ name: "Arabica Espresso 500 g", slug: "arabica-espresso-500-g-1a2b3c4d" }));

    await adminUpdateProduct("product-1", { name: "Arabica Espresso 500 g" }, "admin-1");
    expect(mocks.productUpdate.mock.calls[1][0].data.slug).toMatch(/^arabica-espresso-500-g-[0-9a-f]{8}$/);
  });
});

const adminMeta = { ipAddress: "203.0.113.7", userAgent: "vitest" };

function storedProduct(overrides: Partial<{ status: "DRAFT" | "PUBLISHED" | "INACTIVE" | "BLOCKED"; name: string; slug: string; isFeatured: boolean; price: number }> = {}) {
  return {
    id: "product-1",
    companyId: "company-1",
    name: overrides.name ?? "Кофе в зернах Arabica Blend 1 кг",
    slug: overrides.slug ?? "arabica-blend-1kg",
    status: overrides.status ?? "PUBLISHED",
    isFeatured: overrides.isFeatured ?? false,
    price: new Prisma.Decimal(overrides.price ?? 8_900),
    wholesalePrice: new Prisma.Decimal(7_500),
  };
}

function auditRow() {
  expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  return mocks.auditCreate.mock.calls[0][0].data;
}

describe("admin product moderation is audited in the same transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("blocks a product with a conditional write and one PRODUCT_BLOCKED record", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(storedProduct({ status: "PUBLISHED" }));
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "BLOCKED" });

    await expect(adminSetProductStatus("product-1", "BLOCKED", "admin-1", adminMeta)).resolves.toEqual({
      id: "product-1",
      status: "BLOCKED",
    });

    expect(mocks.productUpdateMany).toHaveBeenCalledWith({
      where: { id: "product-1", status: "PUBLISHED" },
      data: { status: "BLOCKED" },
    });
    expect(auditRow()).toEqual({
      adminUserId: "admin-1",
      companyId: "company-1",
      action: "PRODUCT_BLOCKED",
      entityType: "Product",
      entityId: "product-1",
      before: { status: "PUBLISHED" },
      after: { status: "BLOCKED" },
      ipAddress: "203.0.113.7",
      userAgent: "vitest",
    });
  });

  it("records an admin hide as PRODUCT_HIDDEN", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(storedProduct({ status: "PUBLISHED" }));
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "INACTIVE" });

    await adminSetProductStatus("product-1", "INACTIVE", "admin-1", adminMeta);

    expect(auditRow()).toMatchObject({
      action: "PRODUCT_HIDDEN",
      before: { status: "PUBLISHED" },
      after: { status: "INACTIVE" },
    });
  });

  it("treats a repeated block as idempotent without a second write or audit record", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(storedProduct({ status: "BLOCKED" }));
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "BLOCKED" });

    await expect(adminSetProductStatus("product-1", "BLOCKED", "admin-1")).resolves.toMatchObject({ status: "BLOCKED" });
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("refuses a status change that lost a concurrent race and writes no audit record", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(storedProduct({ status: "PUBLISHED" }));
    mocks.productUpdateMany.mockResolvedValue({ count: 0 });

    await expect(adminSetProductStatus("product-1", "BLOCKED", "admin-1")).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown product without writing or auditing", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(null);

    await expect(adminSetProductStatus("missing", "BLOCKED", "admin-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("lets the admin lift a block by publishing an eligible product and audits PRODUCT_PUBLISHED", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10, productStatus: "BLOCKED" }));
    mocks.productCount.mockResolvedValue(3);
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "PUBLISHED" });

    await expect(adminPublishProduct("product-1", "admin-1", adminMeta)).resolves.toMatchObject({ status: "PUBLISHED" });

    expect(mocks.productFindFirst.mock.calls[0][0].where).toEqual({ id: "product-1" });
    expect(mocks.productCount).toHaveBeenCalledWith({ where: { companyId: "company-1", status: "PUBLISHED" } });
    expect(mocks.productUpdateMany).toHaveBeenCalledWith({
      where: { id: "product-1", status: "BLOCKED" },
      data: { status: "PUBLISHED" },
    });
    expect(auditRow()).toMatchObject({
      adminUserId: "admin-1",
      companyId: "company-1",
      action: "PRODUCT_PUBLISHED",
      entityType: "Product",
      before: { status: "BLOCKED" },
      after: { status: "PUBLISHED" },
      ipAddress: "203.0.113.7",
    });
  });

  it("keeps the trust policy for admin publication and audits nothing when it refuses", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10, companyStatus: "PENDING_REVIEW" }));
    mocks.productCount.mockResolvedValue(0);

    const error = await adminPublishProduct("product-1", "admin-1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toMatchObject({
      reasons: expect.arrayContaining([expect.stringContaining("не активирована")]),
    });
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("treats admin publication of an already published product as idempotent", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(productRecord({ maxProducts: 10, productStatus: "PUBLISHED" }));
    mocks.productCount.mockResolvedValue(10);
    mocks.productFindUniqueOrThrow.mockResolvedValue({ id: "product-1", status: "PUBLISHED" });

    await expect(adminPublishProduct("product-1", "admin-1")).resolves.toMatchObject({ status: "PUBLISHED" });
    expect(mocks.productUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the admin publishes an unknown product", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(null);

    await expect(adminPublishProduct("missing", "admin-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.productCount).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("audits an admin edit with before and after merchandising values", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(storedProduct({ isFeatured: false, price: 8_900 }));
    mocks.productUpdate.mockResolvedValue(storedProduct({ isFeatured: true, price: 9_500 }));

    await expect(
      adminUpdateProduct("product-1", { isFeatured: true, price: 9_500 }, "admin-1", adminMeta),
    ).resolves.toMatchObject({ id: "product-1", isFeatured: true });

    expect(mocks.productUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "product-1" },
      data: { isFeatured: true, price: 9_500 },
    });
    expect(auditRow()).toEqual({
      adminUserId: "admin-1",
      companyId: "company-1",
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: "product-1",
      before: { status: "PUBLISHED", name: "Кофе в зернах Arabica Blend 1 кг", slug: "arabica-blend-1kg", price: 8_900, wholesalePrice: 7_500, isFeatured: false },
      after: { status: "PUBLISHED", name: "Кофе в зернах Arabica Blend 1 кг", slug: "arabica-blend-1kg", price: 9_500, wholesalePrice: 7_500, isFeatured: true },
      ipAddress: "203.0.113.7",
      userAgent: "vitest",
    });
  });

  it("returns 404 when the admin edits an unknown product and audits nothing", async () => {
    runTransaction();
    mocks.productFindUnique.mockResolvedValue(null);

    await expect(adminUpdateProduct("missing", { price: 1 }, "admin-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.productUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("audits an admin-created product as PRODUCT_CREATED for the target company", async () => {
    runTransaction();
    mocks.productCreate.mockResolvedValue(storedProduct({ status: "DRAFT", isFeatured: true }));

    await adminCreateProduct(
      "company-1",
      {
        name: "Кофе в зернах Arabica Blend 1 кг",
        sku: "COF-ARB-001",
        categoryId: "cat-coffee",
        description: "Сбалансированный бленд арабики для эспрессо и молочных напитков.",
        price: 8_900,
        unit: "KG",
        moq: 10,
        stock: 420,
        availabilityStatus: "IN_STOCK",
        city: "Алматы",
        deliveryCities: ["Алматы"],
        leadTimeDays: 3,
        imageUrl: null,
        isFeatured: true,
      },
      "admin-1",
      adminMeta,
    );

    expect(mocks.productCreate.mock.calls[0][0].data).toMatchObject({ companyId: "company-1", status: "DRAFT", isFeatured: true });
    expect(auditRow()).toMatchObject({
      adminUserId: "admin-1",
      companyId: "company-1",
      action: "PRODUCT_CREATED",
      entityType: "Product",
      entityId: "product-1",
      after: { status: "DRAFT", isFeatured: true, price: 8_900 },
      ipAddress: "203.0.113.7",
    });
    expect(auditRow().before).toBeUndefined();
  });
});
