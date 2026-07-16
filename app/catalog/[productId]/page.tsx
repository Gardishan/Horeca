import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Building2, CalendarCheck, Camera, ExternalLink, Mail, MapPin, PackageCheck, Phone, Send, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { getPublicProduct } from "@/lib/services/catalog";
import { AppError } from "@/lib/errors";
import { formatDate, formatMoney, UNIT_LABELS } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/status-badge";
import { BuyerRequestForm } from "@/components/forms/buyer-request-form";

export const dynamic = "force-dynamic";

async function loadProduct(productId: string) {
  try { return await getPublicProduct(productId); } catch (error) { if (error instanceof AppError && error.status === 404) notFound(); throw error; }
}

export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }): Promise<Metadata> {
  const product = await loadProduct((await params).productId);
  return { title: product.name, description: product.description.slice(0, 160) };
}

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const product = await loadProduct((await params).productId);
  const company = product.company;
  const primaryImage = product.images[0]?.url ?? product.imageUrl;
  return (
    <main className="app-shell py-8 md:py-12">
      <nav className="mb-6 text-sm text-slate-500"><Link href="/catalog" className="hover:text-brand-800">Каталог</Link><span className="mx-2">/</span><span>{product.category.name}</span></nav>
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section>
          <div className="surface-flat aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,#e5f4eb,#f7f1e5)]">{primaryImage ? (
            // Direct browser loading avoids server-side fetching of a supplier-controlled URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primaryImage} alt={product.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : null}</div>
          {product.images.length > 1 ? <div className="mt-3 grid grid-cols-5 gap-3">{product.images.map((image) => (
            <div key={image.id} className="aspect-square overflow-hidden rounded-xl border bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            </div>
          ))}</div> : null}
        </section>
        <section className="surface h-fit p-6 md:p-8">
          <div className="flex flex-wrap gap-2"><StatusBadge status="APPROVED" label="Поставщик проверен" />{company.isRecommended ? <StatusBadge status="PUBLISHED" label="Рекомендуемый" /> : null}</div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em] text-brand-700">{product.category.name} · SKU {product.sku}</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-[-0.035em]">{product.name}</h1>
          <p className="mt-4 leading-7 text-slate-600">{product.description}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-sand-50 p-4">
            <div><p className="text-xs text-slate-500">Цена</p><p className="mt-1 text-lg font-extrabold">{formatMoney(product.price, product.currency)}</p></div>
            <div><p className="text-xs text-slate-500">Оптовая цена</p><p className="mt-1 text-lg font-extrabold text-brand-800">{product.wholesalePrice ? formatMoney(product.wholesalePrice, product.currency) : "По запросу"}</p></div>
            <div><p className="text-xs text-slate-500">Минимальный заказ</p><p className="mt-1 font-bold">{product.moq} {UNIT_LABELS[product.unit]}</p></div>
            <div><p className="text-xs text-slate-500">Срок поставки</p><p className="mt-1 font-bold">до {product.leadTimeDays} дн.</p></div>
          </div>
          <div className="mt-5 grid gap-2 text-sm text-slate-600"><p className="flex items-center gap-2"><PackageCheck className="size-4 text-brand-700" /><StatusBadge status={product.availabilityStatus} /></p><p className="flex items-center gap-2"><MapPin className="size-4 text-brand-700" />Отгрузка: {product.city}</p><p className="flex items-start gap-2"><Truck className="mt-0.5 size-4 shrink-0 text-brand-700" />Доставка: {product.deliveryCities.join(", ")}</p></div>
          <a href="#request" className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-900 px-5 py-3 font-bold text-white hover:bg-brand-800"><Send className="size-4" />Запросить коммерческое предложение</a>
        </section>
      </div>
      <div className="mt-8 grid gap-7 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="surface-flat p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Поставщик</p>
          <div className="mt-3 flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-900"><Building2 className="size-5" /></span><div><h2 className="text-xl font-extrabold">{company.name}</h2><p className="mt-1 text-sm text-slate-500">{company.city} · {company.categories.join(", ")}</p></div></div>
          <p className="mt-5 text-sm leading-6 text-slate-600">{company.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {company.phone ? <a className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-brand-50" href={`tel:${company.phone}`}><Phone className="size-4" />Телефон</a> : null}
            {company.email ? <a className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-brand-50" href={`mailto:${company.email}`}><Mail className="size-4" />Email</a> : null}
            {company.whatsapp ? <a className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-brand-50" href={`https://wa.me/${company.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}
            {company.telegram ? <a className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-brand-50" href={`https://t.me/${company.telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer"><Send className="size-4" />Telegram</a> : null}
            {company.instagram ? <a className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-brand-50" href={`https://instagram.com/${company.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer"><Camera className="size-4" />Instagram</a> : null}
            {company.website ? <a className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-brand-50" href={company.website} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Сайт</a> : null}
          </div>
          <div className="mt-6 grid gap-3 border-t pt-5 text-sm"><p className="flex items-center gap-2"><BadgeCheck className="size-4 text-brand-700" />Профиль поставщика подтверждён</p><p className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-700" />Документы проверены вручную</p><p className="flex items-center gap-2"><WalletCards className="size-4 text-brand-700" />Подписка и оплата подтверждены</p><p className="flex items-center gap-2"><CalendarCheck className="size-4 text-brand-700" />Последняя проверка: {formatDate(company.lastVerifiedAt)}</p></div>
        </section>
        <section id="request" className="surface p-6 md:p-8 scroll-mt-24"><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">B2B-заявка</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight">Получить предложение</h2><p className="mb-6 mt-2 text-sm text-slate-500">Укажите объём и контакты — запрос попадёт поставщику в кабинет.</p><BuyerRequestForm productId={product.id} productName={product.name} /></section>
      </div>
    </main>
  );
}
