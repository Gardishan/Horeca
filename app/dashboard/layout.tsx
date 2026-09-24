import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppSidebar, type SidebarItem } from "@/components/ui/app-sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const items: SidebarItem[] = [
  { href: "/dashboard/company", label: "Обзор", icon: "overview" },
  { href: "/dashboard/company/profile", label: "Профиль", icon: "company" },
  { href: "/dashboard/company/billing", label: "Тариф и оплата", icon: "billing" },
  { href: "/dashboard/company/verification", label: "Верификация", icon: "verification" },
  { href: "/dashboard/products", label: "Товары", icon: "products" },
  { href: "/dashboard/requests", label: "Заявки покупателей", icon: "requests" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role !== "SUPPLIER") redirect("/catalog");
  return <main className="app-shell grid gap-6 py-8 lg:grid-cols-[230px_minmax(0,1fr)]"><AppSidebar label="Кабинет поставщика" items={items} /><div className="min-w-0">{children}</div></main>;
}
