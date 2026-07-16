import { requireSupplierCompany } from "@/lib/auth";
import { getCompanyBilling } from "@/lib/services/billing";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { BillingPanel } from "@/components/forms/billing-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatMoney } from "@/lib/constants";

export default async function BillingPage() {
  const { company } = await requireSupplierCompany();
  const data = await getCompanyBilling(company.id);
  const current = data.subscriptions.find((subscription) => subscription.status === "ACTIVE") ?? data.subscriptions[0];
  const plans = data.plans.map((plan) => ({ ...plan, priceMonthly: plan.priceMonthly.toString() }));
  const invoices = data.invoices.map((invoice) => ({ ...invoice, amount: invoice.amount.toString(), payments: invoice.payments.map((payment) => ({ ...payment, amount: payment.amount.toString() })) }));
  return (
    <div className="grid gap-7"><PageHeader eyebrow="Биллинг" title="Тариф и оплата" description="Выберите тариф, сформируйте счёт и загрузите подтверждение банковского перевода." /><Alert tone="warning" title="Ручная оплата MVP">На MVP-этапе оплата подтверждается вручную администратором. Для production потребуется платёжный шлюз и фискальные/бухгалтерские интеграции.</Alert><BillingPanel plans={plans as never} invoices={invoices as never} currentPlanCode={current?.plan.code} />
      <section><h2 className="mb-3 text-lg font-extrabold">История биллинга</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Дата</th><th>Событие</th><th>Описание</th><th>Сумма</th></tr></thead><tbody>{data.history.length ? data.history.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td><StatusBadge status={event.type} label={event.type.toLowerCase().replaceAll("_", " ")} /></td><td>{event.description}</td><td>{event.amount ? formatMoney(event.amount.toString()) : "—"}</td></tr>) : <tr><td colSpan={4} className="text-center text-slate-500">История появится после формирования счёта</td></tr>}</tbody></table></div></section>
    </div>
  );
}

