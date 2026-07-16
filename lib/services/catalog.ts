import type { AvailabilityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { toPlainNumber } from "@/lib/utils";

export type CatalogQuery = {
  search?: string;
  category?: string;
  city?: string;
  availability?: AvailabilityStatus;
  supplierType?: string;
  page?: number;
  pageSize?: number;
};

function publicCompanyWhere(): Prisma.CompanyWhereInput {
  return {
    status: "ACTIVE",
    verificationStatus: "APPROVED",
    isBlocked: false,
    subscriptions: {
      some: {
        status: "ACTIVE",
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
    },
  };
}

function publicProductWhere(query: CatalogQuery = {}): Prisma.ProductWhereInput {
  const search = query.search?.trim();
  return {
    status: "PUBLISHED",
    company: publicCompanyWhere(),
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.city ? { deliveryCities: { has: query.city } } : {}),
    ...(query.availability ? { availabilityStatus: query.availability } : {}),
    ...(query.supplierType ? { company: { ...publicCompanyWhere(), categories: { has: query.supplierType } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const publicProductInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: "asc" as const }, take: 5 },
  company: {
    select: {
      id: true,
      name: true,
      description: true,
      city: true,
      deliveryCities: true,
      categories: true,
      phone: true,
      email: true,
      whatsapp: true,
      telegram: true,
      instagram: true,
      website: true,
      logoUrl: true,
      bannerUrl: true,
      isRecommended: true,
      lastVerifiedAt: true,
      documents: {
        where: { status: "APPROVED" as const },
        select: { id: true },
        take: 1,
      },
      subscriptions: {
        where: { status: "ACTIVE" as const },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { plan: { select: { code: true, name: true } } },
      },
    },
  },
} satisfies Prisma.ProductInclude;

function serializeProduct<T extends { price: Prisma.Decimal; wholesalePrice: Prisma.Decimal | null }>(product: T) {
  return {
    ...product,
    price: toPlainNumber(product.price)!,
    wholesalePrice: toPlainNumber(product.wholesalePrice),
  };
}

export async function listPublicProducts(query: CatalogQuery = {}) {
  const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), 60);
  const page = Math.max(query.page ?? 1, 1);
  const where = publicProductWhere(query);
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: publicProductInclude,
      orderBy: [{ isFeatured: "desc" }, { company: { isRecommended: "desc" } }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: items.map(serializeProduct),
    pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getPublicProduct(productIdOrSlug: string) {
  const product = await prisma.product.findFirst({
    where: {
      ...publicProductWhere(),
      OR: [{ id: productIdOrSlug }, { slug: productIdOrSlug }],
    },
    include: publicProductInclude,
  });
  if (!product) throw new NotFoundError("Товар не найден или недоступен");
  return serializeProduct(product);
}

export async function listCatalogFacets() {
  const [categories, cities, companies] = await Promise.all([
    prisma.productCategory.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
    prisma.deliveryCity.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.company.findMany({ where: publicCompanyWhere(), select: { categories: true } }),
  ]);
  const supplierTypes = [...new Set(companies.flatMap((company) => company.categories))].sort((a, b) => a.localeCompare(b, "ru"));
  return { categories, cities, supplierTypes };
}

export async function createBuyerRequest(data: {
  productId: string;
  buyerName: string;
  buyerCompany: string;
  phone: string;
  email: string;
  message: string;
  quantity: number;
}) {
  const product = await prisma.product.findFirst({
    where: { id: data.productId, ...publicProductWhere() },
    select: { id: true, companyId: true },
  });
  if (!product) throw new NotFoundError("Нельзя отправить запрос по недоступному товару");
  return prisma.buyerRequest.create({
    data: { ...data, companyId: product.companyId },
    select: { id: true, status: true, createdAt: true },
  });
}
