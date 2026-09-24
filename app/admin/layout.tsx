import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppSidebar, type SidebarItem } from "@/components/ui/app-sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const items: SidebarItem[] = [
  { href: "/admin", label: "Обзор", icon: "overview" },
  { href: "/admin/verifications", label: "Верификации", icon: "verification" },
  { href: "/admin/company", label: "Компании", icon: "company" },
  { href: "/admin/products", label: "Товары", icon: "products" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard/company");
  return <main className="app-shell grid gap-6 py-8 lg:grid-cols-[230px_minmax(0,1fr)]"><AppSidebar label="Администрирование" items={items} /><div className="min-w-0">{children}</div></main>;
}
