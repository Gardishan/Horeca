import type { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { evaluateProductPublication } from "@/lib/domain/product-rules";
import { uniqueSlug } from "@/lib/utils";
import type { z } from "zod";
import type { productSchema } from "@/lib/validation";

export type ProductInput = z.infer<typeof productSchema>;

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ProductInclude;

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

export function createCompanyProduct(companyId: string, input: ProductInput, status: ProductStatus = "DRAFT") {
  return prisma.product.create({
    data: {
      ...input,
      slug: uniqueSlug(input.name),
      companyId,
      status,
      wholesalePrice: input.wholesalePrice ?? null,
      imageUrl: input.imageUrl ?? null,
    },
    include: productInclude,
  });
}

export async function updateCompanyProduct(companyId: string, productId: string, input: Partial<ProductInput>) {
  await getCompanyProduct(companyId, productId);
  return prisma.product.update({
    where: { id: productId },
    data: {
      ...input,
      ...(input.name ? { slug: uniqueSlug(input.name) } : {}),
      wholesalePrice: input.wholesalePrice,
      imageUrl: input.imageUrl,
    },
    include: productInclude,
  });
}

export async function publishCompanyProduct(companyId: string, productId: string) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, companyId },
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
    if (!product) throw new NotFoundError("Товар не найден");

    const publishedCount = await tx.product.count({ where: { companyId, status: "PUBLISHED" } });
    const subscription = product.company.subscriptions[0];
    const rule = evaluateProductPublication({
      companyStatus: product.company.status,
      verificationStatus: product.company.verificationStatus,
      companyBlocked: product.company.isBlocked,
      subscriptionStatus: subscription?.status ?? null,
      paymentStatus: subscription?.invoices[0]?.payments[0]?.status ?? null,
      publishedCount,
      maxProducts: subscription?.plan.maxProducts ?? 0,
      productAlreadyPublished: product.status === "PUBLISHED",
    });
    if (!rule.allowed) throw new ConflictError("Товар пока нельзя опубликовать", { reasons: rule.reasons });

    return tx.product.update({ where: { id: productId }, data: { status: "PUBLISHED" }, include: productInclude });
  });
}

export async function setCompanyProductStatus(companyId: string, productId: string, status: ProductStatus) {
  await getCompanyProduct(companyId, productId);
  return prisma.product.update({ where: { id: productId }, data: { status }, include: productInclude });
}
