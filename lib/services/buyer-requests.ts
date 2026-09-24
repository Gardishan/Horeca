import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 24;
const pageSchema = z.union([z.number(), z.string().regex(/^[1-9]\d*$/)])
  .transform(Number)
  .pipe(z.number().int().positive())
  .default(1)
  .refine((page) => (page - 1) * PAGE_SIZE <= 2_147_483_647, "Номер страницы слишком большой");

export async function listSupplierBuyerRequests(rawPage?: unknown) {
  const user = await requireRole("SUPPLIER");
  const page = pageSchema.parse(rawPage);
  const company = await prisma.company.findUnique({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (!company) throw new ForbiddenError("Для пользователя не создан профиль поставщика");

  const where = { companyId: company.id };
  const [items, total] = await prisma.$transaction(async (tx) => Promise.all([
    tx.buyerRequest.findMany({
      where,
      select: {
        id: true,
        buyerName: true,
        buyerCompany: true,
        phone: true,
        email: true,
        message: true,
        quantity: true,
        status: true,
        createdAt: true,
        product: { select: { id: true, name: true, unit: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    tx.buyerRequest.count({ where }),
  ]));

  return {
    items,
    pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
  };
}
