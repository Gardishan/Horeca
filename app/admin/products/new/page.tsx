import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/forms/product-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewAdminProductPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("ADMIN"); const raw = await searchParams; const companyId = Array.isArray(raw.companyId) ? raw.companyId[0] : raw.companyId;
  const companies = await prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, binIin: true } });
  if (!companyId) return <div className="grid gap-7"><PageHeader eyebrow="Новый товар" title="Выберите поставщика" description="Товар будет создан от имени выбранной компании." /><div className="surface-flat divide-y">{companies.map((company) => <Link key={company.id} href={`/admin/products/new?companyId=${company.id}`} className="flex items-center justify-between p-4 hover:bg-brand-50"><span><b className="block">{company.name}</b><small className="text-slate-500">БИН {company.binIin}</small></span><span className="text-sm font-bold text-brand-700">Выбрать →</span></Link>)}</div></div>;
  const company = companies.find((item) => item.id === companyId); if (!company) return null;
  const [categories, cities] = await Promise.all([prisma.productCategory.findMany({ orderBy: { name: "asc" } }), prisma.deliveryCity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  return <div className="grid gap-7"><PageHeader eyebrow="Новый товар" title={`Товар для ${company.name}`} description="Карточка сохранится черновиком; публикация всё равно проверит статус компании и оплаты." /><ProductForm endpoint="/api/admin/products" companyId={company.id} categories={categories.map(({ id, name }) => ({ id, name }))} cities={cities.map(({ id, name }) => ({ id, name }))} redirectTo="/admin/products" /></div>;
}
