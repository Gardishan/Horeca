"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function RegisterForm() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  return <form className="grid gap-4" onSubmit={async (event) => { event.preventDefault(); setPending(true); setError(""); const data = Object.fromEntries(new FormData(event.currentTarget)); const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const payload = await response.json(); if (response.ok) { router.push("/dashboard/company/profile"); router.refresh(); } else setError(payload.error?.message ?? "Не удалось зарегистрироваться"); setPending(false); }}>
    {error ? <Alert tone="danger">{error}</Alert> : null}
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Ваше имя<input className="field" name="name" required /></label><label className="field-label">Рабочий email<input className="field" type="email" name="email" required /></label><label className="field-label">Пароль, от 10 символов<input className="field" type="password" name="password" minLength={10} required /></label><label className="field-label">Публичное название<input className="field" name="companyName" required /></label><label className="field-label">Юридическое название<input className="field" name="legalName" required /></label><label className="field-label">БИН / ИИН<input className="field" name="binIin" pattern="\d{12}" inputMode="numeric" required /></label><label className="field-label">Город<input className="field" name="city" required /></label><label className="field-label">Телефон<input className="field" name="phone" type="tel" required /></label><label className="field-label sm:col-span-2">Юридический адрес<input className="field" name="address" required /></label></div>
    <p className="text-xs leading-5 text-slate-500">Создавая кабинет, вы ещё не принимаете оферту. Согласия фиксируются отдельно на этапе верификации.</p>
    <Button type="submit" disabled={pending}><UserPlus className="size-4" />{pending ? "Создаём кабинет…" : "Зарегистрировать поставщика"}</Button>
    <p className="text-center text-sm text-slate-500">Уже есть кабинет? <Link href="/login" className="font-bold text-brand-800 hover:underline">Войти</Link></p>
  </form>;
}

