"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, FileUp, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatMoney } from "@/lib/constants";

type Plan = { code: "START" | "PRO" | "PREMIUM"; name: string; priceMonthly: { toString(): string }; maxProducts: number | null; features: unknown };
type Invoice = { id: string; invoiceNumber: string; amount: { toString(): string }; currency: string; status: string; payments: Array<{ status: string }> };

export function BillingPanel({ plans, invoices, currentPlanCode }: { plans: Plan[]; invoices: Invoice[]; currentPlanCode?: string }) {
  const router = useRouter(); const [pending, setPending] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(false);
  async function jsonAction(key: string, endpoint: string, body: object = {}) {
    setPending(key); setMessage(""); setError(false);
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setMessage(response.ok ? "Операция выполнена" : payload.error?.message ?? "Ошибка"); setError(!response.ok); setPending(""); if (response.ok) router.refresh();
  }
  async function uploadProof(event: React.FormEvent<HTMLFormElement>, invoiceId: string) {
    event.preventDefault(); setPending(`proof-${invoiceId}`); setMessage("");
    const form = new FormData(event.currentTarget); form.set("invoiceId", invoiceId);
    const response = await fetch("/api/dashboard/company/billing/upload-payment-proof", { method: "POST", body: form }); const payload = await response.json();
    setMessage(response.ok ? "Подтверждение загружено" : payload.error?.message ?? "Ошибка"); setError(!response.ok); setPending(""); if (response.ok) router.refresh();
  }
  const latestInvoice = invoices[0];
  return (
    <div className="grid gap-6">
      {message ? <Alert tone={error ? "danger" : "success"}>{message}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">{plans.map((plan) => { const features = Array.isArray(plan.features) ? plan.features as string[] : []; const selected = currentPlanCode === plan.code; return <div key={plan.code} className={`surface-flat relative p-5 ${selected ? "border-brand-700 ring-2 ring-brand-100" : ""}`}>{selected ? <span className="absolute right-4 top-4 rounded-full bg-brand-100 px-2 py-1 text-[0.65rem] font-bold text-brand-900">Текущий</span> : null}<h3 className="text-lg font-extrabold">{plan.name}</h3><p className="mt-2 text-2xl font-extrabold text-brand-800">{formatMoney(plan.priceMonthly.toString())}<small className="text-xs font-medium text-slate-500"> / мес.</small></p><p className="mt-1 text-xs text-slate-500">{plan.maxProducts ? `до ${plan.maxProducts} товаров` : "безлимитные товары"}</p><ul className="mt-5 grid gap-2">{features.slice(0, 5).map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-600"><Check className="mt-0.5 size-4 shrink-0 text-brand-700" />{feature}</li>)}</ul><Button className="mt-6 w-full" variant={selected ? "secondary" : "primary"} disabled={pending !== ""} onClick={() => jsonAction(`plan-${plan.code}`, "/api/dashboard/company/billing/select-plan", { planCode: plan.code })}>{pending === `plan-${plan.code}` ? "Выбираем…" : "Выбрать тариф"}</Button></div>; })}</div>
      {!latestInvoice ? <div className="surface-flat flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">Счёт ещё не сформирован</h3><p className="mt-1 text-sm text-slate-500">После выбора тарифа создайте счёт на оплату.</p></div><Button disabled={pending !== ""} onClick={() => jsonAction("invoice", "/api/dashboard/company/billing/generate-invoice")}><ReceiptText className="size-4" />{pending === "invoice" ? "Формируем…" : "Сформировать счёт"}</Button></div> : <div className="surface-flat p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Последний счёт</p><h3 className="mt-1 text-lg font-extrabold">{latestInvoice.invoiceNumber}</h3><p className="mt-1 text-sm text-slate-500">{formatMoney(latestInvoice.amount.toString(), latestInvoice.currency)} · {latestInvoice.status}</p></div><Button variant="secondary" disabled={pending !== "" || latestInvoice.status === "PAID"} onClick={() => jsonAction("paid", "/api/dashboard/company/billing/mark-paid", { invoiceId: latestInvoice.id })}>{pending === "paid" ? "Сохраняем…" : "Я оплатил"}</Button></div><form className="mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-end" onSubmit={(event) => uploadProof(event, latestInvoice.id)}><label className="field-label flex-1">Подтверждение оплаты<input className="field" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" required /></label><Button type="submit" variant="secondary" disabled={pending !== ""}><FileUp className="size-4" />{pending === `proof-${latestInvoice.id}` ? "Загружаем…" : "Загрузить"}</Button></form></div>}
    </div>
  );
}

