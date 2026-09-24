import type {
  CompanyStatus,
  PaymentStatus,
  ProductStatus,
  SubscriptionStatus,
  VerificationStatus,
} from "@prisma/client";

export type RuleResult = { allowed: boolean; reasons: string[] };

/**
 * Admin moderation lock: a BLOCKED product is frozen for its supplier (no publish,
 * hide or edit). Only admin use cases move a product out of BLOCKED.
 */
export function evaluateSupplierProductChange(productStatus: ProductStatus): RuleResult {
  if (productStatus === "BLOCKED") return { allowed: false, reasons: ["Товар заблокирован администратором"] };
  return { allowed: true, reasons: [] };
}

/** The public slug (/catalog/<slug>) is regenerated only when a save actually renames the product. */
export function isProductRenamed(currentName: string, nextName: string): boolean {
  return nextName.trim() !== currentName.trim();
}

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

