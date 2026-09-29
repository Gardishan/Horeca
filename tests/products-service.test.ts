import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  productFindFirst: vi.fn(),
  productCount: vi.fn(),
  productUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { publishCompanyProduct } from "@/lib/services/products";
import { ConflictError, NotFoundError } from "@/lib/errors";

const transactionClient = {
  product: {
    findFirst: mocks.productFindFirst,
    count: mocks.productCount,
    update: mocks.productUpdate,
  },
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
  productStatus?: "DRAFT" | "PUBLISHED";
}) {
  const subscription: SubscriptionShape = {
    status: "ACTIVE",
    plan: { maxProducts: options.maxProducts ?? null },
    invoices: [{ payments: [{ status: "CONFIRMED" }] }],
  };
  return {
    id: "product-1",
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
    mocks.productUpdate.mockResolvedValue({ id: "product-1", status: "PUBLISHED" });
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
    expect(mocks.productUpdate).toHaveBeenCalledWith(
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
    expect(mocks.productUpdate).not.toHaveBeenCalled();
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
    expect(mocks.productUpdate).not.toHaveBeenCalled();
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
      expect(mocks.productUpdate, label).not.toHaveBeenCalled();
    }
  });

  it("refuses a product owned by another company before any plan check", async () => {
    runTransaction();
    mocks.productFindFirst.mockResolvedValue(null);

    const error = await publishExpectingConflict();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(mocks.productCount).not.toHaveBeenCalled();
    expect(mocks.productUpdate).not.toHaveBeenCalled();
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
