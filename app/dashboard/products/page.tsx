import Link from "next/link";
import { EyeOff, Plus, Send } from "lucide-react";
import { requireSupplierCompany } from "@/lib/auth";
import { listCompanyProducts } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiActionButton } from "@/components/forms/api-action-button";
import { formatMoney } from "@/lib/constants";

export default async function SupplierProductsPage() {
  const { company } = await requireSupplierCompany();
  const products = await listCompanyProducts(company.id);
  return (
    <div className="grid gap-7"><PageHeader eyebrow="Ассортимент" title="Товары компании" description="Черновики видны только вам. Публикация проверяет верификацию, оплату и лимит тарифа." actions={<ButtonLink href="/dashboard/products/new"><Plus className="size-4" />Добавить товар</ButtonLink>} />
      {products.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Товар</th><th>Категория</th><th>Цена</th><th>Остаток</th><th>Статус</th><th className="text-right">Действия</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><Link className="font-bold hover:text-brand-700" href={`/dashboard/products/${product.id}/edit`}>{product.name}</Link><p className="mt-1 text-xs text-slate-500">SKU {product.sku}</p></td><td>{product.category.name}</td><td>{formatMoney(product.price.toString(), product.currency)}</td><td>{product.stock}</td><td><StatusBadge status={product.status} /></td><td><div className="flex justify-end gap-2">{product.status !== "PUBLISHED" ? <ApiActionButton endpoint={`/api/dashboard/products/${product.id}/publish`}><Send className="size-3.5" />Опубликовать</ApiActionButton> : <ApiActionButton endpoint={`/api/dashboard/products/${product.id}/hide`} confirmMessage="Скрыть товар из каталога?"><EyeOff className="size-3.5" />Скрыть</ApiActionButton>}<ButtonLink href={`/dashboard/products/${product.id}/edit`} variant="ghost">Изменить</ButtonLink></div></td></tr>)}</tbody></table></div> : <EmptyState title="Товаров пока нет" description="Добавьте первый товар — он сохранится черновиком до прохождения всех проверок." action={<ButtonLink href="/dashboard/products/new">Добавить товар</ButtonLink>} />}
    </div>
  );
}

