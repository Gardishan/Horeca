import { Check, Circle, CreditCard, FileCheck2, Package, Users } from "lucide-react";
import { requireSupplierCompany } from "@/lib/auth";
import { getCompanyDashboard } from "@/lib/services/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatMoney } from "@/lib/constants";

export default async function CompanyDashboardPage() {
  const { company } = await requireSupplierCompany();
  const data = await getCompanyDashboard(company.id);
  const completed = data.checklist.filter((item) => item.done).length;
  const maxProducts = data.subscription?.plan.maxProducts;
  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Кабинет поставщика" title={data.company.name} description="Контролируйте готовность компании к публикации, оплату, документы и ассортимент." actions={<ButtonLink href="/dashboard/products/new">Добавить товар</ButtonLink>} />
      {data.company.status !== "ACTIVE" ? <Alert tone="warning" title="Компания ещё не активна">Завершите шаги запуска. Пока компания не одобрена и оплата не подтверждена, товары не попадут в публичный каталог.</Alert> : <Alert tone="success" title="Компания активна">Проверенные опубликованные товары доступны покупателям в каталоге.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Профиль заполнен" value={`${data.profile.percent}%`} icon={Users} /><MetricCard label="Опубликовано" value={data.publishedProducts} note={maxProducts === null ? "Без лимита" : `из ${maxProducts ?? 0}`} icon={Package} tone="blue" /><MetricCard label="Тариф" value={data.subscription?.plan.code ?? "—"} note={data.subscription ? formatMoney(data.subscription.plan.priceMonthly.toString()) : "Не выбран"} icon={CreditCard} tone="amber" /><MetricCard label="Заявки" value={data.company._count.buyerRequests} icon={FileCheck2} /></div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="surface-flat p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Прогресс запуска</h2><p className="mt-1 text-sm text-slate-500">{completed} из {data.checklist.length} шагов завершено</p></div><span className="text-2xl font-extrabold text-brand-800">{Math.round((completed / data.checklist.length) * 100)}%</span></div><progress className="mt-4 h-2 w-full accent-brand-700" value={completed} max={data.checklist.length} aria-label="Прогресс запуска компании">{completed} из {data.checklist.length}</progress><ol className="mt-5 grid gap-3 sm:grid-cols-2">{data.checklist.map((item) => <li key={item.key} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${item.done ? "border-brand-100 bg-brand-50 text-brand-900" : "text-slate-500"}`}>{item.done ? <span className="grid size-6 place-items-center rounded-full bg-brand-700 text-white"><Check className="size-3.5" /></span> : <Circle className="size-6 text-slate-300" />}{item.label}</li>)}</ol></section>
        <section className="surface-flat p-6"><h2 className="text-lg font-extrabold">Текущие статусы</h2><dl className="mt-5 grid gap-4"><div className="flex items-center justify-between gap-3"><dt className="text-sm text-slate-500">Компания</dt><dd><StatusBadge status={data.company.status} /></dd></div><div className="flex items-center justify-between gap-3"><dt className="text-sm text-slate-500">Верификация</dt><dd><StatusBadge status={data.company.verificationStatus} /></dd></div><div className="flex items-center justify-between gap-3"><dt className="text-sm text-slate-500">Подписка</dt><dd><StatusBadge status={data.subscription?.status ?? "INACTIVE"} /></dd></div><div className="flex items-center justify-between gap-3"><dt className="text-sm text-slate-500">Оплата</dt><dd><StatusBadge status={data.payment?.status ?? "PENDING"} /></dd></div></dl><div className="mt-6 grid gap-2"><ButtonLink href="/dashboard/company/verification" variant="secondary">Перейти к верификации</ButtonLink><ButtonLink href="/dashboard/company/billing" variant="ghost">Тариф и оплата</ButtonLink></div></section>
      </div>
    </div>
  );
}
