import { redirect } from "next/navigation";
import { Building2, FileCheck2, LayoutDashboard, Package } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { AppSidebar } from "@/components/ui/app-sidebar";

export const dynamic = "force-dynamic";

const items = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard },
  { href: "/admin/verifications", label: "Верификации", icon: FileCheck2 },
  { href: "/admin/company", label: "Компании", icon: Building2 },
  { href: "/admin/products", label: "Товары", icon: Package },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard/company");
  return <main className="app-shell grid gap-6 py-8 lg:grid-cols-[230px_minmax(0,1fr)]"><AppSidebar label="Администрирование" items={items} /><div className="min-w-0">{children}</div></main>;
}

