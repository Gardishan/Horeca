"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileCheck2, FileUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type DocumentItem = { id: string; type: string; originalName: string; status: string; adminComment: string | null };

export function VerificationPanel({ acceptedTypes, documents }: { acceptedTypes: string[]; documents: DocumentItem[] }) {
  const router = useRouter(); const [pending, setPending] = useState(""); const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  async function post(key: string, endpoint: string, body: object = {}) {
    setPending(key); setFeedback(null); const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json();
    const reasons = payload.error?.details?.reasons; setFeedback({ error: !response.ok, text: response.ok ? "Сохранено" : Array.isArray(reasons) ? reasons.join(" · ") : payload.error?.message ?? "Ошибка" }); setPending(""); if (response.ok) router.refresh();
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending("upload"); setFeedback(null); const response = await fetch("/api/dashboard/company/documents", { method: "POST", body: new FormData(event.currentTarget) }); const payload = await response.json();
    setFeedback({ error: !response.ok, text: response.ok ? "Документ загружен в приватное хранилище" : payload.error?.message ?? "Ошибка" }); setPending(""); if (response.ok) { event.currentTarget.reset(); router.refresh(); }
  }
  return (
    <div className="grid gap-6">
      {feedback ? <Alert tone={feedback.error ? "danger" : "success"}>{feedback.text}</Alert> : null}
      <section className="surface-flat p-5"><h2 className="font-extrabold">1. Юридические согласия</h2><p className="mt-1 text-sm text-slate-500">Фиксируем версию документа, дату, IP и браузер.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{[{ type: "OFFER", label: "Договор-оферта", href: "/legal/offer" }, { type: "PRIVACY", label: "Обработка персональных данных", href: "/legal/privacy" }].map((item) => { const done = acceptedTypes.includes(item.type); return <div key={item.type} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><a className="text-sm font-bold hover:text-brand-700" href={item.href} target="_blank">{item.label}</a><p className="text-xs text-slate-500">{done ? "Принято" : "Ожидает принятия"}</p></div><Button type="button" variant={done ? "secondary" : "primary"} disabled={done || pending !== ""} onClick={() => post(`legal-${item.type}`, "/api/dashboard/company/accept-legal", { type: item.type, accepted: true })}>{done ? <FileCheck2 className="size-4" /> : "Принять"}</Button></div>; })}</div></section>
      <section className="surface-flat p-5"><h2 className="font-extrabold">2. Документы компании</h2><p className="mt-1 text-sm text-slate-500">PDF, JPG, PNG, DOC или DOCX, максимум 10 МБ. Файлы недоступны по публичным URL.</p><form className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1.3fr_auto]" onSubmit={upload}><label className="field-label">Тип<select className="field" name="type" required><option value="REGISTRATION">Регистрация</option><option value="BIN_IIN">БИН / ИИН</option><option value="BANK_DETAILS">Банковские реквизиты</option><option value="CERTIFICATE">Сертификат</option><option value="PRICE_LIST">Прайс-лист</option><option value="POWER_OF_ATTORNEY">Доверенность</option><option value="OTHER">Другое</option></select></label><label className="field-label">Файл<input className="field" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" required /></label><Button type="submit" disabled={pending !== ""}><FileUp className="size-4" />{pending === "upload" ? "Загрузка…" : "Загрузить"}</Button></form>
        <div className="mt-5 table-wrap"><table className="data-table"><thead><tr><th>Документ</th><th>Тип</th><th>Статус</th><th>Комментарий</th></tr></thead><tbody>{documents.length ? documents.map((document) => <tr key={document.id}><td className="font-semibold">{document.originalName}</td><td>{document.type}</td><td>{document.status}</td><td className="max-w-xs text-slate-500">{document.adminComment ?? "—"}</td></tr>) : <tr><td colSpan={4} className="text-center text-slate-500">Документов пока нет</td></tr>}</tbody></table></div>
      </section>
      <section className="surface-flat flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-extrabold">3. Отправить на проверку</h2><p className="mt-1 text-sm text-slate-500">Система автоматически проверит профиль, согласия, документы, тариф и оплату.</p></div><Button disabled={pending !== ""} onClick={() => post("submit", "/api/dashboard/company/submit-verification")}><Send className="size-4" />{pending === "submit" ? "Проверяем…" : "Отправить компанию"}</Button></section>
    </div>
  );
}

