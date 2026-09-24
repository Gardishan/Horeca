import type { CompanyStatus, Prisma, ProductStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

const adminPaymentSelect = {
  id: true,
  companyId: true,
  invoiceId: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  proofFilePath: true,
  adminComment: true,
  paidAt: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

function toAdminPaymentView<T extends { proofFilePath: string | null }>(payment: T) {
  const { proofFilePath, ...safe } = payment;
  return { ...safe, hasProof: Boolean(proofFilePath) };
}

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

export async function listAdminCompanies(query: { search?: string; status?: CompanyStatus; verification?: VerificationStatus } = {}) {
  const companies = await prisma.company.findMany({
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
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: adminPaymentSelect },
      _count: { select: { products: true, documents: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return companies.map((company) => ({
    ...company,
    payments: company.payments.map(toAdminPaymentView),
  }));
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
          updatedAt: true,
          proofFilePath: true,
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
  return {
    ...company,
    payments: company.payments.map(toAdminPaymentView),
  };
}

const adminDocumentSelect = {
  id: true,
  type: true,
  originalName: true,
  status: true,
  antivirusStatus: true,
  uploadedAt: true,
  adminComment: true,
} satisfies Prisma.CompanyDocumentSelect;

/** Upper bound for every admin review queue; items are served oldest first. */
export const ADMIN_QUEUE_LIMIT = 50;

/**
 * Verification attempts awaiting a decision. Only PENDING attempts accept a decision
 * (evaluateVerificationDecision), so terminal attempts are listed only on explicit request.
 * Documents come from the attempt itself; earlier attempts contribute only documents that
 * are still actionable (UNDER_REVIEW) or give context (APPROVED).
 */
export async function listAdminVerifications(status: VerificationStatus = "PENDING") {
  const verifications = await prisma.companyVerification.findMany({
    where: { status },
    select: {
      id: true,
      companyId: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      adminComment: true,
      createdAt: true,
      documents: {
        select: adminDocumentSelect,
        orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
        take: ADMIN_QUEUE_LIMIT,
      },
      company: {
        select: {
          id: true,
          name: true,
          binIin: true,
          city: true,
          documents: {
            where: { status: { in: ["APPROVED", "UNDER_REVIEW"] } },
            select: { ...adminDocumentSelect, verificationId: true },
            orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
            take: ADMIN_QUEUE_LIMIT,
          },
          payments: { orderBy: { createdAt: "desc" }, take: 1, select: adminPaymentSelect },
          subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, plan: { select: { code: true, name: true } } } },
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: ADMIN_QUEUE_LIMIT,
  });
  return verifications.map(({ company: { documents: companyDocuments, payments, ...company }, ...verification }) => ({
    ...verification,
    company: { ...company, payments: payments.map(toAdminPaymentView) },
    earlierDocuments: companyDocuments.flatMap(({ verificationId, ...document }) =>
      verificationId === verification.id ? [] : [document],
    ),
  }));
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
