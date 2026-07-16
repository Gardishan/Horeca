import { ShieldCheck, Sparkles, Truck } from "lucide-react";
import { ProductCard } from "@/components/catalog/product-card";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { Pagination } from "@/components/catalog/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { listCatalogFacets, listPublicProducts } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])) as Record<string, string | undefined>;
  const [{ items, pagination }, facets] = await Promise.all([
    listPublicProducts({
      search: values.search,
      category: values.category,
      city: values.city,
      supplierType: values.supplierType,
      availability: values.availability as never,
      page: Number(values.page ?? 1),
    }),
    listCatalogFacets(),
  ]);
  return (
    <main className="app-shell py-9 md:py-12">
      <section className="relative overflow-hidden rounded-[2rem] bg-brand-950 px-6 py-9 text-white md:px-10 md:py-12">
        <div className="absolute -right-20 -top-28 size-80 rounded-full bg-brand-500/15 blur-2xl" />
        <div className="relative max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">B2B-каталог Казахстана</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] md:text-5xl">Проверенные поставщики для HoReCa-закупок</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 md:text-base">Сравнивайте MOQ, оптовые цены, географию доставки и отправляйте запросы напрямую поставщику.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold text-white/80">{[{ icon: ShieldCheck, text: "Документы проверены" }, { icon: Truck, text: "Доставка по Казахстану" }, { icon: Sparkles, text: "Ручная модерация" }].map(({ icon: Icon, text }) => <span key={text} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/7 px-3 py-2"><Icon className="size-3.5 text-brand-500" />{text}</span>)}</div>
        </div>
      </section>
      <div className="mt-6"><CatalogFilters categories={facets.categories} cities={facets.cities} supplierTypes={facets.supplierTypes} values={values} /></div>
      <div className="mb-4 mt-8 flex items-center justify-between"><div><h2 className="text-xl font-extrabold tracking-tight">Каталог товаров</h2><p className="mt-1 text-sm text-slate-500">Найдено предложений: {pagination.total}</p></div></div>
      {items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <EmptyState title="Ничего не найдено" description="Измените фильтры или сбросьте поиск — в публичном каталоге показываются только активные проверенные поставщики." />}
      <Pagination page={pagination.page} pages={pagination.pages} searchParams={values} />
    </main>
  );
}
