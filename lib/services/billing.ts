import type { PlanCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/audit";

export function getCompanyBilling(companyId: string) {
  return Promise.all([
    prisma.supplierPlan.findMany({ orderBy: { priceMonthly: "asc" } }),
    prisma.subscription.findMany({
      where: { companyId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        subscriptionId: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        createdAt: true,
        updatedAt: true,
        payments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, amount: true, currency: true, method: true, status: true, adminComment: true, paidAt: true, confirmedAt: true, createdAt: true, updatedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingHistory.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]).then(([plans, subscriptions, invoices, history]) => ({ plans, subscriptions, invoices, history }));
}

export async function selectPlan(companyId: string, planCode: PlanCode) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.supplierPlan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundError("Тариф не найден");

    await tx.subscription.updateMany({
      where: { companyId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });
    return tx.subscription.create({
      data: { companyId, planId: plan.id, status: "PENDING_PAYMENT" },
      include: { plan: true },
    });
  });
}

function invoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `HKZ-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function generateInvoice(companyId: string) {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findFirst({
      where: { companyId, status: "PENDING_PAYMENT" },
      include: { plan: true, invoices: { where: { status: { in: ["ISSUED", "PAID_PENDING_CONFIRMATION"] } } } },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) throw new ConflictError("Сначала выберите тариф");
    if (subscription.invoices[0]) return subscription.invoices[0];

    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const invoice = await tx.invoice.create({
      data: {
        companyId,
        subscriptionId: subscription.id,
        invoiceNumber: invoiceNumber(),
        amount: subscription.plan.priceMonthly,
        currency: "KZT",
        status: "ISSUED",
        issuedAt,
        dueAt,
      },
    });
    await tx.payment.create({
      data: {
        companyId,
        invoiceId: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency,
        method: "MANUAL_BANK_TRANSFER",
        status: "PENDING",
      },
    });
    await tx.billingHistory.create({
      data: {
        companyId,
        type: "INVOICE_CREATED",
        amount: invoice.amount,
        description: `Сформирован счёт ${invoice.invoiceNumber} по тарифу ${subscription.plan.name}`,
      },
    });
    return invoice;
  });
}

export async function markInvoicePaid(companyId: string, invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!invoice) throw new NotFoundError("Счёт не найден");
    if (["PAID", "CANCELLED"].includes(invoice.status)) throw new ConflictError("Статус счёта уже нельзя изменить");

    const payment = invoice.payments[0]
      ? await tx.payment.update({
          where: { id: invoice.payments[0].id },
          data: { paidAt: new Date(), status: invoice.payments[0].proofFilePath ? "PROOF_UPLOADED" : "PENDING" },
        })
      : await tx.payment.create({
          data: {
            companyId,
            invoiceId,
            amount: invoice.amount,
            currency: invoice.currency,
            paidAt: new Date(),
            status: "PENDING",
          },
        });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID_PENDING_CONFIRMATION" } });
    return payment;
  });
}

export async function recordPaymentProof(companyId: string, invoiceId: string, proofFilePath: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, companyId, status: { not: "CANCELLED" } },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!invoice) throw new NotFoundError("Счёт не найден");
    const payment = invoice.payments[0];
    if (!payment) throw new ConflictError("Для счёта не создан платёж");
    if (payment.status === "CONFIRMED") throw new ConflictError("Платёж уже подтверждён");

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { proofFilePath, status: "PROOF_UPLOADED", paidAt: payment.paidAt ?? new Date() },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID_PENDING_CONFIRMATION" } });
    await tx.billingHistory.create({
      data: {
        companyId,
        type: "PAYMENT_PROOF_UPLOADED",
        amount: payment.amount,
        description: `Загружено подтверждение оплаты по счёту ${invoice.invoiceNumber}`,
      },
    });
    return updated;
  });
}

export async function confirmPayment(
  paymentId: string,
  adminUserId: string,
  comment: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { subscription: true } } },
    });
    if (!payment) throw new NotFoundError("Платёж не найден");
    if (payment.status === "CONFIRMED") return payment;

    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + 1);
    await tx.subscription.updateMany({
      where: { companyId: payment.companyId, status: "ACTIVE", id: { not: payment.invoice.subscriptionId } },
      data: { status: "EXPIRED", endsAt: now },
    });
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "CONFIRMED", confirmedAt: now, adminComment: comment || null },
    });
    await Promise.all([
      tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: "PAID" } }),
      tx.subscription.update({
        where: { id: payment.invoice.subscriptionId },
        data: { status: "ACTIVE", startsAt: now, endsAt },
      }),
      tx.billingHistory.create({
        data: {
          companyId: payment.companyId,
          type: "PAYMENT_CONFIRMED",
          amount: payment.amount,
          description: `Оплата по счёту ${payment.invoice.invoiceNumber} подтверждена администратором`,
        },
      }),
      writeAuditLog(
        {
          adminUserId,
          companyId: payment.companyId,
          action: "PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: paymentId,
          before: { status: payment.status },
          after: { status: "CONFIRMED", comment },
          ...meta,
        },
        tx,
      ),
    ]);
    return updated;
  });
}

export async function rejectPayment(
  paymentId: string,
  adminUserId: string,
  comment: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  if (!comment.trim()) throw new ConflictError("Укажите причину отклонения платежа");
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
    if (!payment) throw new NotFoundError("Платёж не найден");
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "REJECTED", adminComment: comment, confirmedAt: null },
    });
    await Promise.all([
      tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: "ISSUED" } }),
      tx.billingHistory.create({
        data: {
          companyId: payment.companyId,
          type: "PAYMENT_REJECTED",
          amount: payment.amount,
          description: `Оплата по счёту ${payment.invoice.invoiceNumber} отклонена: ${comment}`,
        },
      }),
      writeAuditLog(
        {
          adminUserId,
          companyId: payment.companyId,
          action: "PAYMENT_REJECTED",
          entityType: "Payment",
          entityId: paymentId,
          before: { status: payment.status },
          after: { status: "REJECTED", comment },
          ...meta,
        },
        tx,
      ),
    ]);
    return updated;
  });
}
