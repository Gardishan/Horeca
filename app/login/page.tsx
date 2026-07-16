import { redirect } from "next/navigation";
import { BadgeCheck, BarChart3, FileLock2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/forms/login-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : user.role === "SUPPLIER" ? "/dashboard/company" : "/catalog");
  return (
    <main className="app-shell grid min-h-[calc(100vh-4rem)] items-center gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="hidden max-w-2xl lg:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Платформа доверенных закупок</p>
        <h1 className="mt-4 text-5xl font-extrabold leading-[1.04] tracking-[-0.045em] text-ink-950">Закупки HoReCa начинаются с проверенного поставщика.</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Управляйте профилем, документами, оплатой и ассортиментом в одном кабинете. Demo-доступ показывает полный путь поставщика и администратора.</p>
        <div className="mt-9 grid grid-cols-3 gap-4">
          {[{ icon: BadgeCheck, label: "Верификация" }, { icon: FileLock2, label: "Приватные документы" }, { icon: BarChart3, label: "Контроль статусов" }].map(({ icon: Icon, label }) => (
            <div key={label} className="surface-flat p-4"><Icon className="size-5 text-brand-700" /><p className="mt-3 text-sm font-bold">{label}</p></div>
          ))}
        </div>
      </section>
      <section className="surface mx-auto w-full max-w-md p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Demo workspace</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Вход в HoReCa KZ</h2>
        <p className="mb-6 mt-2 text-sm text-slate-500">Выберите роль или используйте учётные данные.</p>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-slate-500">Новый поставщик? <Link href="/register" className="font-bold text-brand-800 hover:underline">Создать кабинет</Link></p>
      </section>
    </main>
  );
}
