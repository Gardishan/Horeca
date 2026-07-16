import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "@/components/forms/register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser(); if (user) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard/company");
  return <main className="app-shell py-10"><div className="mx-auto max-w-3xl"><div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Новый поставщик</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] md:text-4xl">Создать кабинет компании</h1><p className="mx-auto mt-3 max-w-xl text-slate-500">После регистрации заполните категории, описание, тариф, оплату и документы — затем отправьте компанию на ручную проверку.</p></div><section className="surface mt-8 p-6 md:p-8"><RegisterForm /></section></div></main>;
}

