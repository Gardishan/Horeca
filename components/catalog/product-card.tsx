import Link from "next/link";
import { BadgeCheck, MapPin, Sparkles, Truck } from "lucide-react";
import { formatMoney, UNIT_LABELS } from "@/lib/constants";
import type { ProductUnit } from "@prisma/client";

type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  wholesalePrice: number | null;
  currency: string;
  moq: number;
  unit: ProductUnit;
  city: string;
  deliveryCities: string[];
  isFeatured: boolean;
  category: { name: string };
  company: { name: string; isRecommended: boolean };
};

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <article className="group surface-flat overflow-hidden hover:-translate-y-1 hover:border-brand-700/25 hover:shadow-soft">
      <Link href={`/catalog/${product.slug}`} className="block">
        <div
          className="relative aspect-[4/3] bg-[linear-gradient(135deg,#e8f5ed,#f7f3e8)] bg-cover bg-center"
          style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl).slice(1, -1)})` } : undefined}
          role="img"
          aria-label={product.name}
        >
          <div className="absolute inset-x-3 top-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/92 px-2.5 py-1 text-[0.68rem] font-bold text-brand-950 shadow-sm backdrop-blur">{product.category.name}</span>
            {product.isFeatured || product.company.isRecommended ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-2.5 py-1 text-[0.68rem] font-bold text-amber-900"><Sparkles className="size-3" />Рекомендуем</span> : null}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700"><BadgeCheck className="size-3.5" />Проверенный поставщик</div>
          <h2 className="mt-2 line-clamp-2 min-h-12 text-base font-bold leading-6 text-ink-950 group-hover:text-brand-700">{product.name}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{product.company.name}</p>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
            <div><p className="text-lg font-extrabold tracking-tight">{formatMoney(product.wholesalePrice ?? product.price, product.currency)}</p><p className="text-[0.68rem] text-slate-500">MOQ {product.moq} {UNIT_LABELS[product.unit]}</p></div>
            <div className="text-right text-[0.7rem] text-slate-500"><span className="flex items-center justify-end gap-1"><MapPin className="size-3" />{product.city}</span><span className="mt-1 flex items-center justify-end gap-1"><Truck className="size-3" />{product.deliveryCities.length > 1 ? `${product.deliveryCities.length} города` : product.deliveryCities[0]}</span></div>
          </div>
        </div>
      </Link>
    </article>
  );
}
