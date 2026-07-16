"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type CompanyProfile = {
  name: string; legalName: string; binIin: string; address: string; city: string;
  deliveryCities: string[]; categories: string[]; description: string; phone: string; email: string;
  whatsapp: string | null; telegram: string | null; instagram: string | null; website: string | null;
  logoUrl: string | null; bannerUrl: string | null;
};

export function CompanyProfileForm({ company, endpoint = "/api/dashboard/company" }: { company: CompanyProfile; endpoint?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return (
    <form
      className="grid gap-6"
      onSubmit={async (event) => {
        event.preventDefault(); setPending(true); setFeedback(null);
        const data = new FormData(event.currentTarget);
        const payload = {
          name: data.get("name"), legalName: data.get("legalName"), binIin: data.get("binIin"), address: data.get("address"), city: data.get("city"),
          deliveryCities: String(data.get("deliveryCities")).split(",").map((item) => item.trim()).filter(Boolean),
          categories: String(data.get("categories")).split(",").map((item) => item.trim()).filter(Boolean),
          description: data.get("description"), phone: data.get("phone"), email: data.get("email"), whatsapp: data.get("whatsapp"), telegram: data.get("telegram"), instagram: data.get("instagram"), website: data.get("website"), logoUrl: data.get("logoUrl"), bannerUrl: data.get("bannerUrl"),
        };
        const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        setFeedback(response.ok ? { tone: "success", text: "Профиль сохранён" } : { tone: "danger", text: result.error?.message ?? "Не удалось сохранить" });
        if (response.ok) router.refresh();
        setPending(false);
      }}
    >
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}
      <fieldset className="surface-flat grid gap-4 p-5 sm:grid-cols-2"><legend className="px-2 text-sm font-bold">Юридическая информация</legend>
        <label className="field-label">Публичное название<input className="field" name="name" defaultValue={company.name} required /></label>
        <label className="field-label">Юридическое название<input className="field" name="legalName" defaultValue={company.legalName} required /></label>
        <label className="field-label">БИН / ИИН<input className="field" name="binIin" inputMode="numeric" pattern="\d{12}" defaultValue={company.binIin} required /></label>
        <label className="field-label">Город<input className="field" name="city" defaultValue={company.city} required /></label>
        <label className="field-label sm:col-span-2">Юридический адрес<input className="field" name="address" defaultValue={company.address} required /></label>
      </fieldset>
      <fieldset className="surface-flat grid gap-4 p-5 sm:grid-cols-2"><legend className="px-2 text-sm font-bold">Профиль поставщика</legend>
        <label className="field-label">Города доставки, через запятую<input className="field" name="deliveryCities" defaultValue={company.deliveryCities.join(", ")} required /></label>
        <label className="field-label">Категории, через запятую<input className="field" name="categories" defaultValue={company.categories.join(", ")} required /></label>
        <label className="field-label sm:col-span-2">Описание<textarea className="field min-h-32" name="description" defaultValue={company.description} minLength={40} required /></label>
      </fieldset>
      <fieldset className="surface-flat grid gap-4 p-5 sm:grid-cols-2"><legend className="px-2 text-sm font-bold">Контакты и медиа</legend>
        <label className="field-label">Телефон<input className="field" name="phone" defaultValue={company.phone} required /></label><label className="field-label">Email<input className="field" type="email" name="email" defaultValue={company.email} required /></label>
        <label className="field-label">WhatsApp<input className="field" name="whatsapp" defaultValue={company.whatsapp ?? ""} /></label><label className="field-label">Telegram<input className="field" name="telegram" defaultValue={company.telegram ?? ""} /></label>
        <label className="field-label">Instagram<input className="field" name="instagram" defaultValue={company.instagram ?? ""} /></label><label className="field-label">Сайт<input className="field" type="url" name="website" defaultValue={company.website ?? ""} /></label>
        <label className="field-label">URL логотипа<input className="field" type="url" name="logoUrl" defaultValue={company.logoUrl ?? ""} /></label><label className="field-label">URL баннера<input className="field" type="url" name="bannerUrl" defaultValue={company.bannerUrl ?? ""} /></label>
      </fieldset>
      <div className="flex justify-end"><Button type="submit" disabled={pending}><Save className="size-4" />{pending ? "Сохраняем…" : "Сохранить профиль"}</Button></div>
    </form>
  );
}

