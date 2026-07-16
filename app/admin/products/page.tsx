import Link from "next/link";
import { Ban, EyeOff, Plus, Send } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listAdminProducts } from "@/lib/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiActionButton } from "@/components/forms/api-action-button";
import { formatMoney } from "@/lib/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("ADMIN"); const raw = await searchParams; const search = Array.isArray(raw.search) ? raw.search[0] : raw.search; const status = (Array.isArray(raw.status) ? raw.status[0] : raw.status) as never;
  const products = await listAdminProducts({ search, status: status || undefined });
  return <div className="grid gap-7"><PageHeader eyebrow="Каталог" title="Управление товарами" description="Редактирование карточек, цен, остатков и статуса публикации." actions={<ButtonLink href="/admin/products/new"><Plus className="size-4" />Добавить товар</ButtonLink>} />
    <form className="surface-flat flex flex-col gap-3 p-4 sm:flex-row"><input className="field flex-1" name="search" defaultValue={search} placeholder="Название или SKU" /><select className="field sm:w-48" name="status" defaultValue={status ?? ""}><option value="">Все статусы</option><option value="DRAFT">Черновик</option><option value="PUBLISHED">Опубликован</option><option value="INACTIVE">Скрыт</option><option value="BLOCKED">Заблокирован</option></select><button className="rounded-xl bg-brand-900 px-5 py-2 text-sm font-bold text-white">Найти</button></form>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Товар</th><th>Поставщик</th><th>Категория</th><th>Цена</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><Link className="font-bold hover:text-brand-700" href={`/admin/products/${product.id}/edit`}>{product.name}</Link><p className="text-xs text-slate-500">SKU {product.sku}</p></td><td><Link className="hover:text-brand-700" href={`/admin/company/${product.companyId}`}>{product.company.name}</Link></td><td>{product.category.name}</td><td>{formatMoney(product.price.toString(), product.currency)}</td><td><StatusBadge status={product.status} /></td><td><div className="flex flex-wrap gap-1">{product.status !== "PUBLISHED" ? <ApiActionButton endpoint={`/api/admin/products/${product.id}/publish`}><Send className="size-3.5" />Публиковать</ApiActionButton> : <ApiActionButton endpoint={`/api/admin/products/${product.id}/hide`}><EyeOff className="size-3.5" />Скрыть</ApiActionButton>}<ApiActionButton endpoint={`/api/admin/products/${product.id}/block`} variant="danger" confirmMessage="Заблокировать товар?"><Ban className="size-3.5" /></ApiActionButton></div></td></tr>)}{products.length === 0 ? <tr><td colSpan={6} className="text-center text-slate-500">Товары не найдены</td></tr> : null}</tbody></table></div>
  </div>;
}

