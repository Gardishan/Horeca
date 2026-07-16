"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function BuyerRequestForm({ productId, productName }: { productId: string; productName: string }) {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  if (success) return <Alert tone="success" title="Запрос отправлен">Поставщик получил вашу заявку по товару «{productName}».</Alert>;
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true); setError("");
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/buyer-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            buyerName: form.get("buyerName"),
            buyerCompany: form.get("buyerCompany"),
            phone: form.get("phone"),
            email: form.get("email"),
            quantity: Number(form.get("quantity")),
            message: form.get("message"),
            website: form.get("website"),
          }),
        });
        const payload = await response.json();
        if (response.ok) setSuccess(true);
        else setError(payload.error?.message ?? "Не удалось отправить запрос");
        setPending(false);
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">Ваше имя<input className="field" name="buyerName" required minLength={2} /></label>
        <label className="field-label">Компания<input className="field" name="buyerCompany" required minLength={2} /></label>
        <label className="field-label">Телефон<input className="field" name="phone" type="tel" required /></label>
        <label className="field-label">Email<input className="field" name="email" type="email" required /></label>
        <label className="field-label">Количество<input className="field" name="quantity" type="number" min={1} defaultValue={1} required /></label>
        <label className="hidden" aria-hidden="true">Сайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="field-label">Комментарий<textarea className="field min-h-28 resize-y" name="message" required minLength={10} defaultValue={`Прошу направить коммерческое предложение на ${productName}.`} /></label>
      <Button type="submit" disabled={pending}><Send className="size-4" />{pending ? "Отправляем…" : "Запросить предложение"}</Button>
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="size-3.5 text-brand-700" />Контакты используются только для ответа на B2B-заявку.</p>
    </form>
  );
}

