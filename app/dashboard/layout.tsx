import { redirect } from "next/navigation";
import { Building2, CreditCard, FileCheck2, LayoutDashboard, Package } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { AppSidebar } from "@/components/ui/app-sidebar";

export const dynamic = "force-dynamic";

const items = [
  { href: "/dashboard/company", label: "Обзор", icon: LayoutDashboard },
  { href: "/dashboard/company/profile", label: "Профиль", icon: Building2 },
  { href: "/dashboard/company/billing", label: "Тариф и оплата", icon: CreditCard },
  { href: "/dashboard/company/verification", label: "Верификация", icon: FileCheck2 },
  { href: "/dashboard/products", label: "Товары", icon: Package },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role !== "SUPPLIER") redirect("/catalog");
  return <main className="app-shell grid gap-6 py-8 lg:grid-cols-[230px_minmax(0,1fr)]"><AppSidebar label="Кабинет поставщика" items={items} /><div className="min-w-0">{children}</div></main>;
}

