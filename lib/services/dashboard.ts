import { LEGAL_VERSION } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { profileCompletion } from "@/lib/domain/verification-rules";

export async function getCompanyDashboard(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, amount: true, currency: true, paidAt: true, confirmedAt: true, adminComment: true, createdAt: true },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true, issuedAt: true, dueAt: true, createdAt: true },
      },
      legalAcceptances: { where: { version: LEGAL_VERSION } },
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: { id: true, type: true, originalName: true, mimeType: true, size: true, status: true, antivirusStatus: true, adminComment: true, uploadedAt: true, reviewedAt: true },
      },
      verifications: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { products: true, buyerRequests: true } },
    },
  });
  if (!company) throw new NotFoundError("Компания не найдена");
  const publishedProducts = await prisma.product.count({ where: { companyId, status: "PUBLISHED" } });
  const profile = profileCompletion(company);
  const subscription = company.subscriptions[0] ?? null;
  const payment = company.payments[0] ?? null;
  const accepted = new Set(company.legalAcceptances.map((item) => item.type));
  const checklist = [
    { key: "profile", label: "Заполнить профиль", done: profile.complete },
    { key: "plan", label: "Выбрать тариф", done: Boolean(subscription) },
    { key: "legal", label: "Принять документы", done: accepted.has("OFFER") && accepted.has("PRIVACY") },
    { key: "documents", label: "Загрузить документы", done: company.documents.length > 0 },
    { key: "payment", label: "Оплатить счёт", done: Boolean(payment?.paidAt || payment?.status === "CONFIRMED") },
    { key: "submit", label: "Отправить на проверку", done: Boolean(company.verifications[0]?.submittedAt) },
    { key: "approved", label: "Получить одобрение", done: company.verificationStatus === "APPROVED" },
  ];
  return { company, subscription, payment, publishedProducts, profile, checklist };
}

export function updateCompanyProfile(companyId: string, data: Record<string, unknown>) {
  return prisma.company.update({ where: { id: companyId }, data });
}
