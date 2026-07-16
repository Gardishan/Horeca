import type { DocumentStatus, DocumentType, LegalType, PaymentStatus } from "@prisma/client";
import type { RuleResult } from "@/lib/domain/product-rules";

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
  documentStatuses: DocumentStatus[];
  paymentStatus: PaymentStatus | null;
};

export function evaluateCompanyActivation(input: ActivationContext): RuleResult {
  const reasons: string[] = [];
  if (!profileCompletion(input.profile).complete) reasons.push("Профиль компании заполнен не полностью");
  if (!input.acceptedLegalTypes.includes("OFFER") || !input.acceptedLegalTypes.includes("PRIVACY")) {
    reasons.push("Нет обязательных юридических согласий");
  }
  if (!input.documentStatuses.length || input.documentStatuses.some((status) => status !== "APPROVED")) {
    reasons.push("Не все документы одобрены");
  }
  if (input.paymentStatus !== "CONFIRMED") reasons.push("Оплата не подтверждена");
  return { allowed: reasons.length === 0, reasons };
}

