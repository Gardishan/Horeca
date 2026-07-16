import type {
  CompanyStatus,
  PaymentStatus,
  SubscriptionStatus,
  VerificationStatus,
} from "@prisma/client";

export type RuleResult = { allowed: boolean; reasons: string[] };

export type PublicationContext = {
  companyStatus: CompanyStatus;
  verificationStatus: VerificationStatus;
  companyBlocked: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  paymentStatus: PaymentStatus | null;
  publishedCount: number;
  maxProducts: number | null;
  productAlreadyPublished?: boolean;
};

export function evaluateProductPublication(input: PublicationContext): RuleResult {
  const reasons: string[] = [];
  if (input.companyStatus !== "ACTIVE") reasons.push("Компания ещё не активирована");
  if (input.verificationStatus !== "APPROVED") reasons.push("Верификация поставщика не одобрена");
  if (input.companyBlocked) reasons.push("Компания заблокирована");
  if (input.subscriptionStatus !== "ACTIVE") reasons.push("Подписка не активна");
  if (input.paymentStatus !== "CONFIRMED") reasons.push("Оплата не подтверждена администратором");

  const nextPublishedCount = input.publishedCount + (input.productAlreadyPublished ? 0 : 1);
  if (input.maxProducts !== null && nextPublishedCount > input.maxProducts) {
    reasons.push(`Лимит тарифа исчерпан: максимум ${input.maxProducts} товаров`);
  }

  return { allowed: reasons.length === 0, reasons };
}

export type PublicVisibilityContext = {
  productStatus: string;
  companyStatus: CompanyStatus;
  verificationStatus: VerificationStatus;
  companyBlocked: boolean;
  subscriptionStatus: SubscriptionStatus | null;
};

export function evaluatePublicVisibility(input: PublicVisibilityContext): RuleResult {
  const reasons: string[] = [];
  if (input.productStatus !== "PUBLISHED") reasons.push("Товар не опубликован");
  if (input.companyStatus !== "ACTIVE") reasons.push("Компания неактивна");
  if (input.verificationStatus !== "APPROVED") reasons.push("Поставщик не проверен");
  if (input.companyBlocked) reasons.push("Поставщик заблокирован");
  if (input.subscriptionStatus !== "ACTIVE") reasons.push("Подписка поставщика неактивна");
  return { allowed: reasons.length === 0, reasons };
}

