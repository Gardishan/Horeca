"use client";

import { useState, type FormEvent } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type BuyerRequestField = "buyerName" | "buyerCompany" | "phone" | "email" | "quantity" | "message";
type FieldErrors = Partial<Record<BuyerRequestField, string>>;

// Limits mirror buyerRequestSchema in lib/validation.ts; the server remains the only barrier.
const FIELD_HINTS: Record<BuyerRequestField, string> = {
  buyerName: "Укажите имя от 2 до 120 символов",
  buyerCompany: "Укажите компанию от 2 до 160 символов",
  phone: "Укажите телефон от 7 до 30 символов",
  email: "Укажите корректный email",
  quantity: "Укажите целое количество от 1 до 10 000 000",
  message: "Комментарий должен содержать от 10 до 2000 символов",
};
const CONNECTION_ERROR = "Не удалось отправить запрос. Проверьте соединение и попробуйте ещё раз.";

function isBuyerRequestField(value: unknown): value is BuyerRequestField {
  return typeof value === "string" && Object.hasOwn(FIELD_HINTS, value);
}

function fieldErrorsFrom(details: unknown): FieldErrors {
  if (!Array.isArray(details)) return {};
  const errors: FieldErrors = {};
  for (const issue of details) {
    const field: unknown = Array.isArray(issue?.path) ? issue.path[0] : undefined;
    if (isBuyerRequestField(field)) errors[field] = FIELD_HINTS[field];
  }
  return errors;
}

export function BuyerRequestForm({ productId, productName, betaDemoOnly = false, defaultQuantity = 1, unitLabel }: { productId: string; productName: string; betaDemoOnly?: boolean; defaultQuantity?: number; unitLabel?: string }) {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  if (success) return <Alert tone="success" title="Запрос отправлен">Поставщик получил вашу заявку по товару «{productName}».</Alert>;

  function invalid(name: BuyerRequestField) {
    return fieldErrors[name] ? { "aria-invalid": true, "aria-describedby": `buyer-request-${name}-error` } : {};
  }
  function hint(name: BuyerRequestField) {
    const message = fieldErrors[name];
    return message ? <span id={`buyer-request-${name}-error`} className="text-xs font-medium text-red-700">{message}</span> : null;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError(""); setFieldErrors({});
    try {
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
          betaDemoAcknowledged: betaDemoOnly ? form.get("betaDemoAcknowledged") === "true" : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        setError(CONNECTION_ERROR);
      } else if (response.ok && payload.ok === true) {
        setSuccess(true);
      } else {
        setFieldErrors(fieldErrorsFrom(payload.error?.details));
        setError(typeof payload.error?.message === "string" ? payload.error.message : "Не удалось отправить запрос");
      }
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">Ваше имя<input className="field" name="buyerName" required minLength={2} maxLength={120} {...invalid("buyerName")} />{hint("buyerName")}</label>
        <label className="field-label">Компания<input className="field" name="buyerCompany" required minLength={2} maxLength={160} {...invalid("buyerCompany")} />{hint("buyerCompany")}</label>
        <label className="field-label">Телефон<input className="field" name="phone" type="tel" required minLength={7} maxLength={30} {...invalid("phone")} />{hint("phone")}</label>
        <label className="field-label">Email<input className="field" name="email" type="email" required {...invalid("email")} />{hint("email")}</label>
        <label className="field-label">Количество{unitLabel ? `, ${unitLabel}` : null}<input className="field" name="quantity" type="number" min={1} max={10_000_000} step={1} defaultValue={defaultQuantity} required {...invalid("quantity")} />{hint("quantity")}</label>
        <label className="hidden" aria-hidden="true">Сайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="field-label">Комментарий<textarea className="field min-h-28 resize-y" name="message" required minLength={10} maxLength={2000} defaultValue={`Прошу направить коммерческое предложение на ${productName}.`} {...invalid("message")} />{hint("message")}</label>
      {betaDemoOnly ? <label className="flex items-start gap-2 text-xs leading-5 text-amber-950"><input className="mt-1" type="checkbox" name="betaDemoAcknowledged" value="true" required />Подтверждаю: имя, компания, телефон и email вымышленные. В контролируемой Beta нельзя указывать реальные контакты.</label> : null}
      <Button type="submit" disabled={pending}><Send className="size-4" />{pending ? "Отправляем…" : "Запросить предложение"}</Button>
      {betaDemoOnly ? null : <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="size-3.5 text-brand-700" />Контакты используются только для ответа на B2B-заявку.</p>}
    </form>
  );
}
