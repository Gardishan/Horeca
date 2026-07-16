import type { CompanyStatus, ProductStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

export async function getAdminStats() {
  const [pendingCompanies, pendingPayments, pendingDocuments, activeSuppliers, blockedSuppliers, totalProducts, publishedProducts, draftProducts] =
    await prisma.$transaction([
      prisma.company.count({ where: { verificationStatus: "PENDING" } }),
      prisma.payment.count({ where: { status: { in: ["PENDING", "PROOF_UPLOADED"] } } }),
      prisma.companyDocument.count({ where: { status: { in: ["UPLOADED", "UNDER_REVIEW"] } } }),
      prisma.company.count({ where: { status: "ACTIVE", isBlocked: false } }),
      prisma.company.count({ where: { OR: [{ status: "BLOCKED" }, { isBlocked: true }] } }),
      prisma.product.count(),
      prisma.product.count({ where: { status: "PUBLISHED" } }),
      prisma.product.count({ where: { status: "DRAFT" } }),
    ]);
  return { pendingCompanies, pendingPayments, pendingDocuments, activeSuppliers, blockedSuppliers, totalProducts, publishedProducts, draftProducts };
}

export function listAdminCompanies(query: { search?: string; status?: CompanyStatus; verification?: VerificationStatus } = {}) {
  return prisma.company.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.verification ? { verificationStatus: query.verification } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { legalName: { contains: query.search, mode: "insensitive" as const } },
              { binIin: { contains: query.search } },
              { city: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      owner: { select: { name: true, email: true } },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { products: true, documents: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getAdminCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          adminComment: true,
          paidAt: true,
          confirmedAt: true,
          createdAt: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true, issuedAt: true, dueAt: true } },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true, issuedAt: true, dueAt: true, createdAt: true, updatedAt: true },
      },
      documents: {
        select: { id: true, type: true, originalName: true, mimeType: true, size: true, status: true, antivirusStatus: true, adminComment: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
      },
      verifications: { orderBy: { createdAt: "desc" } },
      legalAcceptances: { orderBy: { acceptedAt: "desc" } },
      products: { include: { category: true }, orderBy: { updatedAt: "desc" } },
      auditLogs: { include: { adminUser: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!company) throw new NotFoundError("Компания не найдена");
  return company;
}

export function listAdminVerifications(status?: VerificationStatus) {
  return prisma.companyVerification.findMany({
    where: status ? { status } : { status: { in: ["PENDING", "REUPLOAD_REQUESTED"] } },
    include: {
      company: {
        include: {
          documents: {
            select: { id: true, type: true, originalName: true, status: true, antivirusStatus: true, uploadedAt: true, adminComment: true },
          },
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
          subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });
}

export function listAdminProducts(query: { search?: string; status?: ProductStatus; companyId?: string; categoryId?: string } = {}) {
  return prisma.product.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { sku: { contains: query.search, mode: "insensitive" } }] }
        : {}),
    },
    include: { company: { select: { id: true, name: true } }, category: true },
    orderBy: { updatedAt: "desc" },
  });
}
