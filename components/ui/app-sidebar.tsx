"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type SidebarItem = { href: string; label: string; icon: LucideIcon };

export function AppSidebar({ label, items }: { label: string; items: SidebarItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="surface-flat h-fit p-3 lg:sticky lg:top-24">
      <p className="px-3 pb-2 pt-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <nav className="flex gap-2 overflow-x-auto lg:grid" aria-label={label}>
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-max items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${active ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-brand-50 hover:text-brand-950"}`}
            >
              <Icon className="size-4" />{item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

