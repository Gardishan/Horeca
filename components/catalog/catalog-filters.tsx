import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

export function CatalogFilters({ categories, cities, supplierTypes, values }: { categories: Array<{ name: string; slug: string }>; cities: Array<{ name: string }>; supplierTypes: string[]; values: Record<string, string | undefined> }) {
  const active = Object.values(values).some(Boolean);
  return (
    <form className="surface-flat grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.7fr)_repeat(4,minmax(135px,1fr))_auto]" action="/catalog">
      <label className="relative"><span className="sr-only">Поиск</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input className="field pl-9" name="search" defaultValue={values.search} placeholder="Товар, SKU или поставщик" /></label>
      <label><span className="sr-only">Категория</span><select className="field" name="category" defaultValue={values.category ?? ""}><option value="">Все категории</option>{categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></label>
      <label><span className="sr-only">Город доставки</span><select className="field" name="city" defaultValue={values.city ?? ""}><option value="">Любой город</option>{cities.map((city) => <option key={city.name} value={city.name}>{city.name}</option>)}</select></label>
      <label><span className="sr-only">Тип поставщика</span><select className="field" name="supplierType" defaultValue={values.supplierType ?? ""}><option value="">Любой поставщик</option>{supplierTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label><span className="sr-only">Наличие</span><select className="field" name="availability" defaultValue={values.availability ?? ""}><option value="">Любое наличие</option><option value="IN_STOCK">В наличии</option><option value="LOW_STOCK">Мало</option><option value="OUT_OF_STOCK">Нет в наличии</option><option value="PRE_ORDER">Предзаказ</option></select></label>
      <div className="flex gap-2"><button className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800"><SlidersHorizontal className="size-4" />Найти</button>{active ? <Link href="/catalog" aria-label="Сбросить фильтры" className="grid size-11 place-items-center rounded-xl border bg-white text-slate-500 hover:text-brand-900"><X className="size-4" /></Link> : null}</div>
    </form>
  );
}
