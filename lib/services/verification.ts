import type { AntivirusStatus, DocumentStatus, DocumentType, LegalType, VerificationStatus } from "@prisma/client";
import { LEGAL_VERSION } from "@/lib/constants";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  evaluateCompanyActivation,
  evaluateDocumentDecision,
  evaluateVerificationSubmission,
  evaluateVerificationDecision,
  isDocumentSafeForApproval,
} from "@/lib/domain/verification-rules";
import { isDeployedApplicationEnvironment } from "@/lib/runtime-config";
import { writeAuditLog } from "@/lib/services/audit";

type ClientMeta = { ipAddress?: string | null; userAgent?: string | null };

export async function acceptLegal(companyId: string, userId: string, type: LegalType, meta: ClientMeta) {
  return prisma.legalAcceptance.upsert({
    where: { companyId_userId_type_version: { companyId, userId, type, version: LEGAL_VERSION } },
    update: { acceptedAt: new Date(), ...meta },
    create: { companyId, userId, type, version: LEGAL_VERSION, ...meta },
  });
}

export function listCompanyDocuments(companyId: string) {
  return prisma.companyDocument.findMany({
    where: { companyId },
    select: {
      id: true,
      type: true,
      originalName: true,
      mimeType: true,
      size: true,
      status: true,
      antivirusStatus: true,
      adminComment: true,
      uploadedAt: true,
      reviewedAt: true,
    },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function registerCompanyDocument(input: {
  companyId: string;
  type: DocumentType;
  originalName: string;
  storedName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  antivirusStatus: AntivirusStatus;
}) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.companyVerification.findFirst({
      where: { companyId: input.companyId },
      orderBy: { createdAt: "desc" },
    });
    const verification =
      latest && ["NOT_STARTED", "PENDING"].includes(latest.status)
        ? latest
        : await tx.companyVerification.create({ data: { companyId: input.companyId } });
    return tx.companyDocument.create({
      data: {
        ...input,
        verificationId: verification.id,
        status: verification.status === "PENDING" ? "UNDER_REVIEW" : "UPLOADED",
      },
      select: {
        id: true,
        type: true,
        originalName: true,
        status: true,
        antivirusStatus: true,
        uploadedAt: true,
      },
    });
  });
}

export async function getVerificationContext(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      legalAcceptances: { where: { version: LEGAL_VERSION } },
      documents: { orderBy: { uploadedAt: "desc" } },
      subscriptions: { where: { status: { in: ["PENDING_PAYMENT", "ACTIVE"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      invoices: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 1 },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      verifications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!company) throw new NotFoundError("Компания не найдена");
  return company;
}

export async function submitCompanyVerification(companyId: string) {
  const company = await getVerificationContext(companyId);
  const rule = evaluateVerificationSubmission({
    profile: company,
    acceptedLegalTypes: company.legalAcceptances.map((item) => item.type),
    documents: company.documents.map((document) => ({ type: document.type, status: document.status })),
    hasSelectedPlan: company.subscriptions.length > 0,
    hasInvoice: company.invoices.length > 0,
    paymentStatus: company.payments[0]?.status ?? null,
  });
  if (!rule.allowed) throw new ConflictError("Компания пока не готова к проверке", { reasons: rule.reasons });
  if (company.isBlocked || company.status === "BLOCKED") {
    throw new ConflictError("Заблокированную компанию нельзя отправить на проверку");
  }

  const current = company.verifications[0];
  if (current?.status === "PENDING") return current;

  return prisma.$transaction(async (tx) => {
    const submittedAt = new Date();
    let verification;
    if (current?.status === "NOT_STARTED") {
      const attemptClaim = await tx.companyVerification.updateMany({
        where: { id: current.id, status: "NOT_STARTED" },
        data: { status: "PENDING", submittedAt },
      });
      if (attemptClaim.count !== 1) {
        throw new ConflictError("Статус проверки уже изменён другим действием");
      }
      verification = await tx.companyVerification.findUniqueOrThrow({
        where: { id: current.id },
      });
    } else {
      verification = await tx.companyVerification.create({
        data: { companyId, status: "PENDING", submittedAt },
      });
    }

    const companyClaim = await tx.company.updateMany({
      where: {
        id: companyId,
        status: company.status,
        verificationStatus: company.verificationStatus,
        isBlocked: false,
      },
      data: { status: "PENDING_REVIEW", verificationStatus: "PENDING" },
    });
    if (companyClaim.count !== 1) {
      throw new ConflictError("Статус компании уже изменён другим действием");
    }
    await tx.companyDocument.updateMany({
      where: { companyId, verificationId: verification.id, status: "UPLOADED" },
      data: { status: "UNDER_REVIEW" },
    });
    return verification;
  });
}

export async function decideVerification(
  verificationId: string,
  status: Extract<VerificationStatus, "APPROVED" | "REJECTED" | "REUPLOAD_REQUESTED">,
  adminUserId: string,
  comment: string,
  meta: ClientMeta = {},
) {
  if (status !== "APPROVED" && !comment.trim()) throw new ConflictError("Укажите причину решения");
  return prisma.$transaction(async (tx) => {
    const verification = await tx.companyVerification.findUnique({ where: { id: verificationId } });
    if (!verification) throw new NotFoundError("Проверка не найдена");
    const decision = evaluateVerificationDecision(verification.status, status);
    if (!decision.allowed) {
      throw new ConflictError("Решение возможно только для проверки в ожидании");
    }
    if (decision.idempotent) return verification;
    const claim = await tx.companyVerification.updateMany({
      where: { id: verificationId, status: "PENDING" },
      data: { status, reviewedAt: new Date(), reviewedById: adminUserId, adminComment: comment || null },
    });
    if (claim.count !== 1) {
      const current = await tx.companyVerification.findUnique({ where: { id: verificationId } });
      if (!current) throw new NotFoundError("Проверка не найдена");
      const currentDecision = evaluateVerificationDecision(current.status, status);
      if (currentDecision.allowed && currentDecision.idempotent) return current;
      throw new ConflictError("Статус проверки уже изменён другим решением");
    }
    await tx.company.update({
      where: { id: verification.companyId },
      data: {
        verificationStatus: status,
        lastVerifiedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await writeAuditLog(
      {
        adminUserId,
        companyId: verification.companyId,
        action: `VERIFICATION_${status}`,
        entityType: "CompanyVerification",
        entityId: verificationId,
        before: { status: verification.status },
        after: { status, comment },
        ...meta,
      },
      tx,
    );
    return tx.companyVerification.findUniqueOrThrow({ where: { id: verificationId } });
  });
}

export async function decideDocument(
  documentId: string,
  status: Extract<DocumentStatus, "APPROVED" | "REJECTED" | "REUPLOAD_REQUESTED">,
  adminUserId: string,
  comment: string,
  meta: ClientMeta = {},
) {
  if (status !== "APPROVED" && !comment.trim()) throw new ConflictError("Укажите причину решения");
  return prisma.$transaction(async (tx) => {
    const document = await tx.companyDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundError("Документ не найден");
    if (
      status === "APPROVED" &&
      !isDocumentSafeForApproval(
        document.antivirusStatus,
        isDeployedApplicationEnvironment(),
      )
    ) {
      throw new ConflictError(
        "Документ нельзя одобрить без успешной антивирусной проверки",
      );
    }
    const decision = evaluateDocumentDecision(document.status, status);
    if (!decision.allowed) {
      throw new ConflictError("Решение возможно только для документа на проверке");
    }
    if (decision.idempotent) {
      return tx.companyDocument.findUniqueOrThrow({
        where: { id: documentId },
        select: { id: true, type: true, originalName: true, status: true, adminComment: true, reviewedAt: true },
      });
    }
    const claim = await tx.companyDocument.updateMany({
      where: { id: documentId, status: "UNDER_REVIEW" },
      data: { status, reviewedAt: new Date(), reviewedById: adminUserId, adminComment: comment || null },
    });
    if (claim.count !== 1) {
      const current = await tx.companyDocument.findUnique({ where: { id: documentId } });
      if (!current) throw new NotFoundError("Документ не найден");
      const currentDecision = evaluateDocumentDecision(current.status, status);
      if (currentDecision.allowed && currentDecision.idempotent) {
        return tx.companyDocument.findUniqueOrThrow({
          where: { id: documentId },
          select: { id: true, type: true, originalName: true, status: true, adminComment: true, reviewedAt: true },
        });
      }
      throw new ConflictError("Статус документа уже изменён другим решением");
    }
    await writeAuditLog(
      {
        adminUserId,
        companyId: document.companyId,
        action: `DOCUMENT_${status}`,
        entityType: "CompanyDocument",
        entityId: documentId,
        before: { status: document.status },
        after: { status, comment },
        ...meta,
      },
      tx,
    );
    return tx.companyDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { id: true, type: true, originalName: true, status: true, adminComment: true, reviewedAt: true },
    });
  });
}

export async function activateCompany(companyId: string, adminUserId: string, meta: ClientMeta = {}) {
  const company = await getVerificationContext(companyId);
  const rule = evaluateCompanyActivation({
    profile: company,
    acceptedLegalTypes: company.legalAcceptances.map((item) => item.type),
    documents: company.documents.map((document) => ({
      status: document.status,
      antivirusStatus: document.antivirusStatus,
    })),
    deployed: isDeployedApplicationEnvironment(),
    paymentStatus: company.payments[0]?.status ?? null,
  });
  if (!rule.allowed || company.verificationStatus !== "APPROVED") {
    const reasons = [...rule.reasons];
    if (company.verificationStatus !== "APPROVED") reasons.push("Верификация компании не одобрена");
    throw new ConflictError("Компанию пока нельзя активировать", { reasons });
  }
  return prisma.$transaction(async (tx) => {
    const claim = await tx.company.updateMany({
      where: {
        id: companyId,
        verificationStatus: "APPROVED",
        isBlocked: false,
        status: { not: "BLOCKED" },
      },
      data: { status: "ACTIVE", isBlocked: false },
    });
    if (claim.count !== 1) {
      throw new ConflictError("Статус компании уже изменён другим действием");
    }
    await writeAuditLog(
      {
        adminUserId,
        companyId,
        action: "COMPANY_ACTIVATED",
        entityType: "Company",
        entityId: companyId,
        before: { status: company.status, isBlocked: company.isBlocked },
        after: { status: "ACTIVE", isBlocked: false },
        ...meta,
      },
      tx,
    );
    return tx.company.findUniqueOrThrow({ where: { id: companyId } });
  });
}

export async function blockCompany(companyId: string, adminUserId: string, comment: string, meta: ClientMeta = {}) {
  if (!comment.trim()) throw new ConflictError("Укажите причину блокировки");
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundError("Компания не найдена");
    const updated = await tx.company.update({
      where: { id: companyId },
      data: { status: "BLOCKED", isBlocked: true },
    });
    await tx.product.updateMany({ where: { companyId, status: "PUBLISHED" }, data: { status: "INACTIVE" } });
    await writeAuditLog(
      {
        adminUserId,
        companyId,
        action: "COMPANY_BLOCKED",
        entityType: "Company",
        entityId: companyId,
        before: { status: company.status, isBlocked: company.isBlocked },
        after: { status: "BLOCKED", isBlocked: true, comment },
        ...meta,
      },
      tx,
    );
    return updated;
  });
}
