import type { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { evaluateProductPublication, evaluateSupplierProductChange, isProductRenamed } from "@/lib/domain/product-rules";
import { writeAuditLog, type AuditInput } from "@/lib/services/audit";
import { toPlainNumber, uniqueSlug } from "@/lib/utils";
import type { z } from "zod";
import type { productSchema, supplierProductSchema } from "@/lib/validation";

type ProductInput = z.infer<typeof productSchema>;
type SupplierProductInput = z.infer<typeof supplierProductSchema>;
type ClientMeta = Pick<AuditInput, "ipAddress" | "userAgent">;

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ProductInclude;

type AuditedProduct = {
  status: ProductStatus;
  name: string;
  slug: string;
  price: Prisma.Decimal;
  wholesalePrice: Prisma.Decimal | null;
  isFeatured: boolean;
};

/** Bounded moderation snapshot for the admin journal: no description or media payloads. */
function auditSnapshot(product: AuditedProduct) {
  return {
    status: product.status,
    name: product.name,
    slug: product.slug,
    price: toPlainNumber(product.price),
    wholesalePrice: toPlainNumber(product.wholesalePrice),
    isFeatured: product.isFeatured,
  };
}

function productCreateData(companyId: string, input: ProductInput) {
  return {
    ...input,
    slug: uniqueSlug(input.name),
    companyId,
    status: "DRAFT" as const,
    wholesalePrice: input.wholesalePrice ?? null,
    imageUrl: input.imageUrl ?? null,
  };
}

function productUpdateData(currentName: string, input: Partial<ProductInput>) {
  return {
    ...input,
    ...(input.name !== undefined && isProductRenamed(currentName, input.name) ? { slug: uniqueSlug(input.name) } : {}),
  };
}

function findProductForPublication(tx: Prisma.TransactionClient, where: Prisma.ProductWhereInput) {
  return tx.product.findFirst({
    where,
    include: {
      company: {
        include: {
          subscriptions: {
            where: {
              status: "ACTIVE",
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              plan: true,
              invoices: {
                where: { status: "PAID" },
                orderBy: { createdAt: "desc" },
                take: 1,
                include: {
                  payments: {
                    where: { status: "CONFIRMED" },
                    orderBy: { confirmedAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

type PublicationCandidate = NonNullable<Awaited<ReturnType<typeof findProductForPublication>>>;

async function assertPublicationAllowed(tx: Prisma.TransactionClient, companyId: string, product: PublicationCandidate) {
  const publishedCount = await tx.product.count({ where: { companyId, status: "PUBLISHED" } });
  const subscription = product.company.subscriptions[0];
  const rule = evaluateProductPublication({
    companyStatus: product.company.status,
    verificationStatus: product.company.verificationStatus,
    companyBlocked: product.company.isBlocked,
    subscriptionStatus: subscription?.status ?? null,
    paymentStatus: subscription?.invoices[0]?.payments[0]?.status ?? null,
    publishedCount,
    maxProducts: subscription ? subscription.plan.maxProducts : 0,
    productAlreadyPublished: product.status === "PUBLISHED",
  });
  if (!rule.allowed) throw new ConflictError("Товар пока нельзя опубликовать", { reasons: rule.reasons });
}

export function listCompanyProducts(companyId: string) {
  return prisma.product.findMany({
    where: { companyId },
    include: productInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCompanyProduct(companyId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, companyId }, include: productInclude });
  if (!product) throw new NotFoundError("Товар не найден");
  return product;
}

export function createCompanyProduct(companyId: string, input: SupplierProductInput) {
  return prisma.product.create({ data: productCreateData(companyId, input), include: productInclude });
}

function supplierLockConflict(reasons: string[]) {
  return new ConflictError("Товар заблокирован администратором и недоступен для изменений", { reasons });
}

async function readSupplierProduct(tx: Prisma.TransactionClient, companyId: string, productId: string) {
  const product = await tx.product.findFirst({ where: { id: productId, companyId }, select: { name: true, status: true } });
  if (!product) throw new NotFoundError("Товар не найден");
  const lock = evaluateSupplierProductChange(product.status);
  if (!lock.allowed) throw supplierLockConflict(lock.reasons);
  return product;
}

/**
 * Supplier writes exclude BLOCKED in SQL: an admin block committed after the read
 * makes the conditional update miss, so the supplier can never overwrite it.
 */
async function writeSupplierProduct(
  tx: Prisma.TransactionClient,
  companyId: string,
  productId: string,
  data: Prisma.ProductUncheckedUpdateManyInput,
) {
  const claim = await tx.product.updateMany({
    where: { id: productId, companyId, status: { not: "BLOCKED" } },
    data,
  });
  if (claim.count !== 1) throw supplierLockConflict(evaluateSupplierProductChange("BLOCKED").reasons);
  return tx.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
}

export function updateCompanyProduct(companyId: string, productId: string, input: Partial<SupplierProductInput>) {
  return prisma.$transaction(async (tx) => {
    const product = await readSupplierProduct(tx, companyId, productId);
    return writeSupplierProduct(tx, companyId, productId, productUpdateData(product.name, input));
  });
}

export function publishCompanyProduct(companyId: string, productId: string) {
  return prisma.$transaction(async (tx) => {
    const product = await findProductForPublication(tx, { id: productId, companyId });
    if (!product) throw new NotFoundError("Товар не найден");
    const lock = evaluateSupplierProductChange(product.status);
    if (!lock.allowed) throw supplierLockConflict(lock.reasons);
    await assertPublicationAllowed(tx, companyId, product);
    return writeSupplierProduct(tx, companyId, productId, { status: "PUBLISHED" });
  });
}

export function hideCompanyProduct(companyId: string, productId: string) {
  return prisma.$transaction(async (tx) => {
    await readSupplierProduct(tx, companyId, productId);
    return writeSupplierProduct(tx, companyId, productId, { status: "INACTIVE" });
  });
}

/**
 * Admin status write: compare-and-swap on the status that was read, so the journal
 * records the state that was actually replaced, then the audit row in the same transaction.
 */
async function writeAdminProductStatus(
  tx: Prisma.TransactionClient,
  product: { id: string; companyId: string; status: ProductStatus },
  status: ProductStatus,
  action: string,
  adminUserId: string,
  meta: ClientMeta,
) {
  const claim = await tx.product.updateMany({
    where: { id: product.id, status: product.status },
    data: { status },
  });
  if (claim.count !== 1) throw new ConflictError("Статус товара уже изменён другим действием");
  await writeAuditLog(
    {
      adminUserId,
      companyId: product.companyId,
      action,
      entityType: "Product",
      entityId: product.id,
      before: { status: product.status },
      after: { status },
      ...meta,
    },
    tx,
  );
  return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
}

export function adminCreateProduct(companyId: string, input: ProductInput, adminUserId: string, meta: ClientMeta = {}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: productCreateData(companyId, input), include: productInclude });
    await writeAuditLog(
      {
        adminUserId,
        companyId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: product.id,
        after: auditSnapshot(product),
        ...meta,
      },
      tx,
    );
    return product;
  });
}

export function adminUpdateProduct(
  productId: string,
  input: Partial<ProductInput>,
  adminUserId: string,
  meta: ClientMeta = {},
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.product.findUnique({ where: { id: productId } });
    if (!before) throw new NotFoundError("Товар не найден");
    const updated = await tx.product.update({
      where: { id: productId },
      data: productUpdateData(before.name, input),
      include: productInclude,
    });
    await writeAuditLog(
      {
        adminUserId,
        companyId: before.companyId,
        action: "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: productId,
        before: auditSnapshot(before),
        after: auditSnapshot(updated),
        ...meta,
      },
      tx,
    );
    return updated;
  });
}

export function adminPublishProduct(productId: string, adminUserId: string, meta: ClientMeta = {}) {
  return prisma.$transaction(async (tx) => {
    const product = await findProductForPublication(tx, { id: productId });
    if (!product) throw new NotFoundError("Товар не найден");
    await assertPublicationAllowed(tx, product.companyId, product);
    if (product.status === "PUBLISHED") {
      return tx.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
    }
    return writeAdminProductStatus(tx, product, "PUBLISHED", "PRODUCT_PUBLISHED", adminUserId, meta);
  });
}

const ADMIN_STATUS_ACTIONS = { INACTIVE: "PRODUCT_HIDDEN", BLOCKED: "PRODUCT_BLOCKED" } as const;

export function adminSetProductStatus(
  productId: string,
  status: keyof typeof ADMIN_STATUS_ACTIONS,
  adminUserId: string,
  meta: ClientMeta = {},
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, companyId: true, status: true },
    });
    if (!product) throw new NotFoundError("Товар не найден");
    if (product.status === status) {
      return tx.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
    }
    return writeAdminProductStatus(tx, product, status, ADMIN_STATUS_ACTIONS[status], adminUserId, meta);
  });
}
