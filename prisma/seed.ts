import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

const now = new Date();
const nextMonth = new Date(now);
nextMonth.setMonth(nextMonth.getMonth() + 1);

const planData = [
  { id: "plan-start", code: "START" as const, name: "START", priceMonthly: 15_000, maxProducts: 10, features: ["Профиль компании", "До 10 товаров", "Заявки покупателей", "Базовая статистика"] },
  { id: "plan-pro", code: "PRO" as const, name: "PRO", priceMonthly: 35_000, maxProducts: 100, features: ["До 100 товаров", "Приоритет в поиске", "Расширенная статистика", "WhatsApp и Telegram CTA", "Бейдж проверенного поставщика"] },
  { id: "plan-premium", code: "PREMIUM" as const, name: "PREMIUM", priceMonthly: 75_000, maxProducts: null, features: ["Безлимитные товары", "Закрепление в категории", "Приоритетные заявки", "Аналитика просмотров и кликов", "Рекомендуемый поставщик"] },
];

const categories = [
  ["cat-coffee", "Кофе, чай и напитки", "coffee-tea-drinks"],
  ["cat-dairy", "Молочная продукция", "dairy"],
  ["cat-packaging", "Упаковка и одноразовая посуда", "packaging"],
  ["cat-equipment", "Оборудование", "equipment"],
  ["cat-fresh", "Овощи и фрукты", "fresh-produce"],
  ["cat-cleaning", "Клининг и бытовая химия", "cleaning"],
] as const;

const cities = ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Атырау"];

async function createMockPdf(companyId: string, fileName: string, title: string) {
  const root = path.resolve(process.env.PRIVATE_STORAGE_ROOT ?? "./storage/private");
  const directory = path.join(root, "company-documents", companyId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const pdf = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% HoReCa KZ seed document: ${title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
  await writeFile(path.join(directory, fileName), pdf, { mode: 0o600 });
  return { storagePath: path.join("company-documents", companyId, fileName), size: pdf.length };
}

async function main() {
  const passwordHash = await bcrypt.hash("demo123", 12);

  for (const plan of planData) {
    await prisma.supplierPlan.upsert({ where: { code: plan.code }, update: plan, create: plan });
  }
  for (const [id, name, slug] of categories) {
    await prisma.productCategory.upsert({ where: { slug }, update: { name }, create: { id, name, slug } });
  }
  for (const [index, name] of cities.entries()) {
    const slug = name === "Алматы" ? "almaty" : name === "Астана" ? "astana" : name === "Шымкент" ? "shymkent" : `city-${index}`;
    await prisma.deliveryCity.upsert({ where: { slug }, update: { name, sortOrder: index }, create: { id: `city-${index + 1}`, name, slug, sortOrder: index } });
  }

  const users = [
    { id: "user-admin", email: "admin@horeca.kz", name: "Demo Admin", role: "ADMIN" as const },
    { id: "user-supplier-active", email: "supplier@horeca.kz", name: "Aruzhan Supplier", role: "SUPPLIER" as const },
    { id: "user-supplier-pending", email: "pending@horeca.kz", name: "Timur Pending", role: "SUPPLIER" as const },
  ];
  for (const user of users) {
    await prisma.user.upsert({ where: { email: user.email }, update: { ...user, passwordHash }, create: { ...user, passwordHash } });
  }

  await prisma.company.upsert({
    where: { ownerId: "user-supplier-active" },
    update: {},
    create: {
      id: "company-active", ownerId: "user-supplier-active", name: "Qazaq Coffee & Food Supply", legalName: "ТОО Qazaq Coffee & Food Supply", binIin: "220540012345", address: "г. Алматы, ул. Толе би, 155", city: "Алматы", deliveryCities: ["Алматы", "Астана", "Шымкент"], categories: ["кофе", "чай", "сиропы", "ингредиенты"], description: "Комплексный поставщик кофе, напитков, ингредиентов и профессионального оборудования для кофеен, ресторанов и отелей Казахстана.", phone: "+7 727 355 55 55", email: "sales@qazaqcoffee.kz", whatsapp: "+77015555555", telegram: "qazaqcoffee", instagram: "qazaqcoffee.kz", website: "https://example.com", logoUrl: null, bannerUrl: null, status: "ACTIVE", verificationStatus: "APPROVED", isRecommended: true, lastVerifiedAt: now,
    },
  });
  await prisma.company.upsert({
    where: { ownerId: "user-supplier-pending" },
    update: {},
    create: {
      id: "company-pending", ownerId: "user-supplier-pending", name: "Fresh Horeca Distribution", legalName: "ТОО Fresh Horeca Distribution", binIin: "240140067890", address: "г. Алматы, пр. Рыскулова, 48", city: "Алматы", deliveryCities: ["Алматы"], categories: ["овощи", "фрукты", "молочная продукция"], description: "Поставщик свежих овощей, фруктов и молочной продукции для ресторанов, столовых, кофеен и служб кейтеринга Алматы.", phone: "+7 701 222 33 44", email: "order@freshhoreca.kz", whatsapp: "+77012223344", telegram: "freshhoreca", status: "PENDING_REVIEW", verificationStatus: "PENDING", isRecommended: false,
    },
  });

  await prisma.subscription.upsert({ where: { id: "subscription-active" }, update: {}, create: { id: "subscription-active", companyId: "company-active", planId: "plan-pro", status: "ACTIVE", startsAt: now, endsAt: nextMonth } });
  await prisma.subscription.upsert({ where: { id: "subscription-pending" }, update: {}, create: { id: "subscription-pending", companyId: "company-pending", planId: "plan-start", status: "PENDING_PAYMENT" } });

  await prisma.invoice.upsert({ where: { invoiceNumber: "HKZ-DEMO-0001" }, update: {}, create: { id: "invoice-active", companyId: "company-active", subscriptionId: "subscription-active", invoiceNumber: "HKZ-DEMO-0001", amount: 35_000, currency: "KZT", status: "PAID", issuedAt: now, dueAt: nextMonth } });
  await prisma.invoice.upsert({ where: { invoiceNumber: "HKZ-DEMO-0002" }, update: {}, create: { id: "invoice-pending", companyId: "company-pending", subscriptionId: "subscription-pending", invoiceNumber: "HKZ-DEMO-0002", amount: 15_000, currency: "KZT", status: "PAID_PENDING_CONFIRMATION", issuedAt: now, dueAt: nextMonth } });
  await prisma.payment.upsert({ where: { id: "payment-active" }, update: {}, create: { id: "payment-active", companyId: "company-active", invoiceId: "invoice-active", amount: 35_000, currency: "KZT", method: "MANUAL_BANK_TRANSFER", status: "CONFIRMED", paidAt: now, confirmedAt: now, adminComment: "Seed: оплата подтверждена" } });
  await prisma.payment.upsert({ where: { id: "payment-pending" }, update: {}, create: { id: "payment-pending", companyId: "company-pending", invoiceId: "invoice-pending", amount: 15_000, currency: "KZT", method: "MANUAL_BANK_TRANSFER", status: "PROOF_UPLOADED", paidAt: now, proofFilePath: "company-documents/company-pending/payment-proof.pdf" } });

  await prisma.companyVerification.upsert({ where: { id: "verification-active" }, update: {}, create: { id: "verification-active", companyId: "company-active", status: "APPROVED", submittedAt: now, reviewedAt: now, reviewedById: "user-admin", adminComment: "Seed: документы проверены" } });
  await prisma.companyVerification.upsert({ where: { id: "verification-pending" }, update: {}, create: { id: "verification-pending", companyId: "company-pending", status: "PENDING", submittedAt: now } });

  for (const companyId of ["company-active", "company-pending"]) {
    const userId = companyId === "company-active" ? "user-supplier-active" : "user-supplier-pending";
    for (const type of ["OFFER", "PRIVACY"] as const) {
      await prisma.legalAcceptance.upsert({ where: { companyId_userId_type_version: { companyId, userId, type, version: "mvp-2026-07" } }, update: {}, create: { companyId, userId, type, version: "mvp-2026-07", ipAddress: "127.0.0.1", userAgent: "Prisma seed" } });
    }
  }

  const activeRegistration = await createMockPdf("company-active", "mock-registration.pdf", "registration");
  const activeBank = await createMockPdf("company-active", "mock-bank-details.pdf", "bank details");
  const activeCertificate = await createMockPdf("company-active", "mock-certificate.pdf", "quality certificate");
  const pendingRegistration = await createMockPdf("company-pending", "mock-registration-pending.pdf", "registration pending");
  await createMockPdf("company-pending", "payment-proof.pdf", "payment proof");
  const documents = [
    { id: "document-registration-active", companyId: "company-active", verificationId: "verification-active", type: "REGISTRATION" as const, originalName: "Справка о регистрации.pdf", storedName: "mock-registration.pdf", ...activeRegistration, status: "APPROVED" as const, reviewedAt: now, reviewedById: "user-admin" },
    { id: "document-bank-active", companyId: "company-active", verificationId: "verification-active", type: "BANK_DETAILS" as const, originalName: "Банковские реквизиты.pdf", storedName: "mock-bank-details.pdf", ...activeBank, status: "APPROVED" as const, reviewedAt: now, reviewedById: "user-admin" },
    { id: "document-certificate-active", companyId: "company-active", verificationId: "verification-active", type: "CERTIFICATE" as const, originalName: "Сертификат качества.pdf", storedName: "mock-certificate.pdf", ...activeCertificate, status: "APPROVED" as const, reviewedAt: now, reviewedById: "user-admin" },
    { id: "document-registration-pending", companyId: "company-pending", verificationId: "verification-pending", type: "REGISTRATION" as const, originalName: "Регистрация Fresh Horeca.pdf", storedName: "mock-registration-pending.pdf", ...pendingRegistration, status: "UNDER_REVIEW" as const, reviewedAt: null, reviewedById: null },
  ];
  for (const document of documents) {
    await prisma.companyDocument.upsert({ where: { id: document.id }, update: {}, create: { ...document, mimeType: "application/pdf", antivirusStatus: "SKIPPED_MOCK" } });
  }

  const products = [
    { id: "product-coffee", companyId: "company-active", name: "Кофе в зернах Arabica Blend 1 кг", slug: "arabica-blend-1kg", sku: "COF-ARB-001", categoryId: "cat-coffee", description: "Сбалансированный бленд арабики для эспрессо и молочных напитков. Стабильный профиль обжарки для кофеен и ресторанов.", price: 8_900, wholesalePrice: 7_500, unit: "KG" as const, moq: 10, stock: 420, availabilityStatus: "IN_STOCK" as const, status: "PUBLISHED" as const, city: "Алматы", deliveryCities: ["Алматы", "Астана", "Шымкент"], leadTimeDays: 3, imageUrl: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80", isFeatured: true },
    { id: "product-syrup", companyId: "company-active", name: "Сироп ванильный для кофеен 1 л", slug: "vanilla-syrup-1l", sku: "SYR-VAN-001", categoryId: "cat-coffee", description: "Концентрированный ванильный сироп для кофе, лимонадов и десертов. Профессиональный формат для заведений HoReCa.", price: 4_200, wholesalePrice: 3_650, unit: "LITER" as const, moq: 6, stock: 180, availabilityStatus: "IN_STOCK" as const, status: "PUBLISHED" as const, city: "Алматы", deliveryCities: ["Алматы", "Астана", "Шымкент"], leadTimeDays: 2, imageUrl: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=80", isFeatured: false },
    { id: "product-cups", companyId: "company-active", name: "Одноразовые стаканы 250 мл, 1000 шт", slug: "paper-cups-250ml-1000", sku: "CUP-250-1000", categoryId: "cat-packaging", description: "Плотные бумажные стаканы для горячих напитков. Короб 1000 штук, совместимы со стандартными крышками 80 мм.", price: 48_000, wholesalePrice: 43_000, unit: "BOX" as const, moq: 1, stock: 75, availabilityStatus: "IN_STOCK" as const, status: "PUBLISHED" as const, city: "Алматы", deliveryCities: ["Алматы", "Астана"], leadTimeDays: 4, imageUrl: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1200&q=80", isFeatured: false },
    { id: "product-milk", companyId: "company-pending", name: "Молоко бариста 3.2%, короб", slug: "barista-milk-32-box", sku: "MLK-BAR-032", categoryId: "cat-dairy", description: "Ультрапастеризованное молоко с устойчивой текстурой для латте-арта. В коробе 12 упаковок по одному литру.", price: 9_600, wholesalePrice: 8_800, unit: "BOX" as const, moq: 3, stock: 60, availabilityStatus: "IN_STOCK" as const, status: "DRAFT" as const, city: "Алматы", deliveryCities: ["Алматы"], leadTimeDays: 1, imageUrl: null, isFeatured: false },
    { id: "product-machine", companyId: "company-active", name: "Профессиональная кофемашина 2-group", slug: "professional-coffee-machine-2-group", sku: "EQP-CM-002", categoryId: "cat-equipment", description: "Двухгруппная эспрессо-машина для заведений со средней и высокой проходимостью. Установка и базовое обучение включены.", price: 2_850_000, wholesalePrice: 2_690_000, unit: "PIECE" as const, moq: 1, stock: 3, availabilityStatus: "LOW_STOCK" as const, status: "PUBLISHED" as const, city: "Алматы", deliveryCities: ["Алматы", "Астана", "Шымкент", "Караганда"], leadTimeDays: 7, imageUrl: "https://images.unsplash.com/photo-1587080413959-06b859fb107d?auto=format&fit=crop&w=1200&q=80", isFeatured: true },
    { id: "product-fresh", companyId: "company-pending", name: "Овощной микс для ресторанов, 10 кг", slug: "fresh-vegetable-mix-10kg", sku: "FRESH-MIX-010", categoryId: "cat-fresh", description: "Сезонный микс свежих овощей с утренней комплектацией заказа и доставкой по Алматы в согласованное окно.", price: 17_500, wholesalePrice: 15_900, unit: "BOX" as const, moq: 2, stock: 0, availabilityStatus: "PRE_ORDER" as const, status: "INACTIVE" as const, city: "Алматы", deliveryCities: ["Алматы"], leadTimeDays: 1, imageUrl: null, isFeatured: false },
  ];
  for (const product of products) {
    await prisma.product.upsert({ where: { id: product.id }, update: {}, create: { ...product, currency: "KZT" } });
  }

  await prisma.billingHistory.upsert({ where: { id: "billing-active-confirmed" }, update: {}, create: { id: "billing-active-confirmed", companyId: "company-active", type: "PAYMENT_CONFIRMED", amount: 35_000, description: "Оплата демо-счёта подтверждена" } });
  await prisma.billingHistory.upsert({ where: { id: "billing-pending-proof" }, update: {}, create: { id: "billing-pending-proof", companyId: "company-pending", type: "PAYMENT_PROOF_UPLOADED", amount: 15_000, description: "Загружено подтверждение оплаты" } });

  console.log("HoReCa KZ seed completed");
  console.log("Demo password for all accounts: demo123");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());

