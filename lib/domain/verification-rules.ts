import type {
  AntivirusStatus,
  DocumentStatus,
  DocumentType,
  LegalType,
  PaymentStatus,
  VerificationStatus,
} from "@prisma/client";
import type { RuleResult } from "@/lib/domain/product-rules";

export type ReviewDecisionResult = {
  allowed: boolean;
  idempotent: boolean;
};

export function evaluateVerificationDecision(
  current: VerificationStatus,
  target: Extract<VerificationStatus, "APPROVED" | "REJECTED" | "REUPLOAD_REQUESTED">,
): ReviewDecisionResult {
  if (current === target) return { allowed: true, idempotent: true };
  if (current === "PENDING") return { allowed: true, idempotent: false };
  return { allowed: false, idempotent: false };
}

export function evaluateDocumentDecision(
  current: DocumentStatus,
  target: Extract<DocumentStatus, "APPROVED" | "REJECTED" | "REUPLOAD_REQUESTED">,
): ReviewDecisionResult {
  if (current === target) return { allowed: true, idempotent: true };
  if (current === "UNDER_REVIEW") return { allowed: true, idempotent: false };
  return { allowed: false, idempotent: false };
}

export type CompanyProfileSnapshot = {
  name?: string | null;
  legalName?: string | null;
  binIin?: string | null;
  address?: string | null;
  city?: string | null;
  categories?: string[] | null;
  deliveryCities?: string[] | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
};

const REQUIRED_PROFILE_FIELDS: Array<keyof CompanyProfileSnapshot> = [
  "name",
  "legalName",
  "binIin",
  "address",
  "city",
  "categories",
  "deliveryCities",
  "description",
  "phone",
  "email",
];

export function profileCompletion(profile: CompanyProfileSnapshot) {
  const missing = REQUIRED_PROFILE_FIELDS.filter((field) => {
    const value = profile[field];
    return Array.isArray(value) ? value.length === 0 : !value || !String(value).trim();
  });
  return {
    complete: missing.length === 0,
    missing,
    percent: Math.round(((REQUIRED_PROFILE_FIELDS.length - missing.length) / REQUIRED_PROFILE_FIELDS.length) * 100),
  };
}

export type VerificationSubmissionContext = {
  profile: CompanyProfileSnapshot;
  acceptedLegalTypes: LegalType[];
  documents: Array<{ type: DocumentType; status: DocumentStatus }>;
  hasSelectedPlan: boolean;
  hasInvoice: boolean;
  paymentStatus: PaymentStatus | null;
};

export function evaluateVerificationSubmission(input: VerificationSubmissionContext): RuleResult {
  const reasons: string[] = [];
  const profile = profileCompletion(input.profile);
  if (!profile.complete) reasons.push(`Заполните профиль: ${profile.missing.join(", ")}`);
  if (!input.acceptedLegalTypes.includes("OFFER")) reasons.push("Примите договор-оферту");
  if (!input.acceptedLegalTypes.includes("PRIVACY")) reasons.push("Примите политику обработки данных");

  const requiredDocument = input.documents.some(
    (document) =>
      ["REGISTRATION", "BIN_IIN"].includes(document.type) &&
      !["REJECTED", "REUPLOAD_REQUESTED"].includes(document.status),
  );
  if (!requiredDocument) reasons.push("Загрузите свидетельство регистрации или документ БИН/ИИН");
  if (!input.hasSelectedPlan) reasons.push("Выберите тариф");
  if (!input.hasInvoice) reasons.push("Сформируйте счёт");
  if (!input.paymentStatus || input.paymentStatus === "REJECTED") {
    reasons.push("Отметьте оплату или загрузите подтверждение платежа");
  }
  return { allowed: reasons.length === 0, reasons };
}

export type ActivationContext = {
  profile: CompanyProfileSnapshot;
  acceptedLegalTypes: LegalType[];
  documents: Array<{
    type: DocumentType;
    status: DocumentStatus;
    antivirusStatus: AntivirusStatus;
    uploadedAt: Date;
  }>;
  deployed: boolean;
  paymentStatus: PaymentStatus | null;
};

export function isDocumentSafeForApproval(
  antivirusStatus: AntivirusStatus,
  deployed: boolean,
) {
  return (
    antivirusStatus === "CLEAN" ||
    (!deployed && antivirusStatus === "SKIPPED_MOCK")
  );
}

const SUPERSEDABLE_DOCUMENT_STATUSES: DocumentStatus[] = ["REJECTED", "REUPLOAD_REQUESTED"];
const REQUIRED_DOCUMENT_TYPES: DocumentType[] = ["REGISTRATION", "BIN_IIN"];

/**
 * Documents are immutable review history. A REJECTED or REUPLOAD_REQUESTED
 * document stops counting only when a strictly newer upload of the same type
 * exists; every other document, including unreviewed replacements, counts.
 */
function currentDocuments(documents: ActivationContext["documents"]) {
  const newestUploadByType = new Map<DocumentType, number>();
  for (const document of documents) {
    const uploadedAt = document.uploadedAt.getTime();
    if (uploadedAt > (newestUploadByType.get(document.type) ?? Number.NEGATIVE_INFINITY)) {
      newestUploadByType.set(document.type, uploadedAt);
    }
  }
  return documents.filter(
    (document) =>
      !SUPERSEDABLE_DOCUMENT_STATUSES.includes(document.status) ||
      document.uploadedAt.getTime() === newestUploadByType.get(document.type),
  );
}

export function evaluateCompanyActivation(input: ActivationContext): RuleResult {
  const reasons: string[] = [];
  if (!profileCompletion(input.profile).complete) reasons.push("Профиль компании заполнен не полностью");
  if (!input.acceptedLegalTypes.includes("OFFER") || !input.acceptedLegalTypes.includes("PRIVACY")) {
    reasons.push("Нет обязательных юридических согласий");
  }
  const documents = currentDocuments(input.documents);
  if (
    !documents.length ||
    documents.some((document) => document.status !== "APPROVED")
  ) {
    reasons.push("Не все документы одобрены");
  }
  if (
    !documents.some(
      (document) =>
        REQUIRED_DOCUMENT_TYPES.includes(document.type) &&
        document.status === "APPROVED",
    )
  ) {
    reasons.push("Нет одобренного свидетельства регистрации или документа БИН/ИИН");
  }
  if (
    documents.some(
      (document) =>
        !isDocumentSafeForApproval(document.antivirusStatus, input.deployed),
    )
  ) {
    reasons.push("Не все документы прошли антивирусную проверку");
  }
  if (input.paymentStatus !== "CONFIRMED") reasons.push("Оплата не подтверждена");
  return { allowed: reasons.length === 0, reasons };
}
