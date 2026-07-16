import Link from "next/link";
import { Building2, LayoutDashboard, ShieldCheck, Store } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/forms/logout-button";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-brand-950/8 bg-sand-50/90 backdrop-blur-xl">
      <div className="app-shell flex h-16 items-center justify-between gap-4">
        <Link href="/catalog" className="flex items-center gap-2.5" aria-label="HoReCa KZ — каталог">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-900 text-white"><Store className="size-5" /></span>
          <span><b className="block text-sm leading-none tracking-tight">HoReCa KZ</b><small className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-brand-700">B2B marketplace</small></span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">
          <Link href="/catalog" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-brand-900">Каталог</Link>
          <Link href="/legal/supplier-verification" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-brand-900">Как проверяем</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href={user.role === "ADMIN" ? "/admin" : user.role === "SUPPLIER" ? "/dashboard/company" : "/catalog"} className="hidden items-center gap-2 rounded-xl border border-brand-900/10 bg-white px-3 py-2 text-xs font-semibold text-brand-950 sm:flex">
                {user.role === "ADMIN" ? <ShieldCheck className="size-4" /> : <Building2 className="size-4" />}{user.name}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"><LayoutDashboard className="size-4" />Войти</Link>
          )}
        </div>
      </div>
    </header>
  );
}

