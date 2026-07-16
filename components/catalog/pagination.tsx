import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pages, searchParams }: { page: number; pages: number; searchParams: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  function href(nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, value);
    params.set("page", String(nextPage));
    return `/catalog?${params}`;
  }
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Пагинация">
      <Link aria-disabled={page <= 1} className={`grid size-10 place-items-center rounded-xl border bg-white ${page <= 1 ? "pointer-events-none opacity-40" : "hover:border-brand-700"}`} href={href(page - 1)}><ChevronLeft className="size-4" /></Link>
      <span className="text-sm font-semibold text-slate-600">{page} из {pages}</span>
      <Link aria-disabled={page >= pages} className={`grid size-10 place-items-center rounded-xl border bg-white ${page >= pages ? "pointer-events-none opacity-40" : "hover:border-brand-700"}`} href={href(page + 1)}><ChevronRight className="size-4" /></Link>
    </nav>
  );
}

