import type { PlanCode, ProductUnit } from "@prisma/client";

export const APP_NAME = "HoReCa KZ";
export const LEGAL_VERSION = "mvp-2026-07";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const PLAN_DEFINITIONS: Record<
  PlanCode,
  { name: string; price: number; maxProducts: number | null; features: string[] }
> = {
  START: {
    name: "START",
    price: 15_000,
    maxProducts: 10,
    features: [
      "Профиль компании",
      "До 10 товаров",
      "Заявки покупателей",
      "Базовая статистика",
    ],
  },
  PRO: {
    name: "PRO",
    price: 35_000,
    maxProducts: 100,
    features: [
      "До 100 товаров",
      "Приоритет в поиске",
      "Расширенная статистика",
      "WhatsApp и Telegram CTA",
      "Бейдж проверенного поставщика",
    ],
  },
  PREMIUM: {
    name: "PREMIUM",
    price: 75_000,
    maxProducts: null,
    features: [
      "Безлимитные товары",
      "Закрепление в категории",
      "Приоритетные заявки",
      "Аналитика просмотров и кликов",
      "Отметка рекомендуемого поставщика",
    ],
  },
};

export const UNIT_LABELS: Record<ProductUnit, string> = {
  KG: "кг",
  LITER: "л",
  PIECE: "шт",
  BOX: "короб",
  BAG: "мешок",
  PACKAGE: "упаковка",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  PENDING_REVIEW: "На проверке",
  ACTIVE: "Активна",
  BLOCKED: "Заблокирована",
  REJECTED: "Отклонено",
  NOT_STARTED: "Не начата",
  PENDING: "Ожидает",
  APPROVED: "Одобрено",
  REUPLOAD_REQUESTED: "Нужна перезагрузка",
  INACTIVE: "Неактивна",
  PENDING_PAYMENT: "Ожидает оплаты",
  EXPIRED: "Истекла",
  CANCELLED: "Отменена",
  ISSUED: "Выставлен",
  PAID_PENDING_CONFIRMATION: "Оплата проверяется",
  PAID: "Оплачен",
  PROOF_UPLOADED: "Чек загружен",
  CONFIRMED: "Подтверждено",
  UPLOADED: "Загружен",
  UNDER_REVIEW: "Проверяется",
  PUBLISHED: "Опубликован",
  IN_STOCK: "В наличии",
  LOW_STOCK: "Мало",
  OUT_OF_STOCK: "Нет в наличии",
  PRE_ORDER: "Предзаказ",
};

export const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ACTIVE: "success",
  APPROVED: "success",
  CONFIRMED: "success",
  PAID: "success",
  PUBLISHED: "success",
  IN_STOCK: "success",
  PENDING: "warning",
  PENDING_REVIEW: "warning",
  PENDING_PAYMENT: "warning",
  UNDER_REVIEW: "warning",
  PROOF_UPLOADED: "warning",
  PAID_PENDING_CONFIRMATION: "warning",
  LOW_STOCK: "warning",
  REJECTED: "danger",
  BLOCKED: "danger",
  REUPLOAD_REQUESTED: "danger",
  OUT_OF_STOCK: "danger",
  DRAFT: "neutral",
  INACTIVE: "neutral",
  NOT_STARTED: "neutral",
  PRE_ORDER: "info",
};

export const DEMO_ACCOUNTS = [
  { email: "admin@horeca.kz", password: "demo123", role: "ADMIN", label: "Demo Admin" },
  { email: "supplier@horeca.kz", password: "demo123", role: "SUPPLIER", label: "Active Supplier" },
  { email: "pending@horeca.kz", password: "demo123", role: "SUPPLIER", label: "Pending Supplier" },
] as const;

export const KZ_CITIES = ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Атырау"];

export function formatMoney(value: number | string, currency = "KZT") {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-KZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

