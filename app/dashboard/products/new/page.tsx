import { requireSupplierCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/forms/product-form";

export default async function NewSupplierProductPage() {
  await requireSupplierCompany();
  const [categories, cities] = await Promise.all([prisma.productCategory.findMany({ orderBy: { name: "asc" } }), prisma.deliveryCity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  return <div className="grid gap-7"><PageHeader eyebrow="Новый товар" title="Добавить товар" description="Карточка сохранится как черновик. Опубликовать её можно после верификации компании и подтверждения оплаты." /><ProductForm endpoint="/api/dashboard/products" categories={categories.map(({ id, name }) => ({ id, name }))} cities={cities.map(({ id, name }) => ({ id, name }))} redirectTo="/dashboard/products" /></div>;
}
