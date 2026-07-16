import { Building2, CreditCard, FileClock, Package, ShieldAlert, Store } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getAdminStats, listAdminVerifications } from "@/lib/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/constants";

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");
  const [stats, queue] = await Promise.all([getAdminStats(), listAdminVerifications("PENDING")]);
  return <div className="grid gap-7"><PageHeader eyebrow="Operations center" title="Админ-панель" description="Очередь ручной модерации поставщиков, документов, оплат и товаров." actions={<ButtonLink href="/admin/verifications">Открыть очередь</ButtonLink>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Компании на проверке" value={stats.pendingCompanies} icon={FileClock} tone="amber" /><MetricCard label="Ожидают оплаты" value={stats.pendingPayments} icon={CreditCard} tone="amber" /><MetricCard label="Активные поставщики" value={stats.activeSuppliers} icon={Store} /><MetricCard label="Заблокированы" value={stats.blockedSuppliers} icon={ShieldAlert} tone="red" /><MetricCard label="Документы в очереди" value={stats.pendingDocuments} icon={Building2} tone="blue" /><MetricCard label="Всего товаров" value={stats.totalProducts} icon={Package} tone="blue" /><MetricCard label="Опубликовано" value={stats.publishedProducts} icon={Package} /><MetricCard label="Черновики" value={stats.draftProducts} icon={Package} /></div>
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">Ближайшие проверки</h2><ButtonLink href="/admin/verifications" variant="ghost">Все проверки</ButtonLink></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Компания</th><th>Отправлена</th><th>Документы</th><th>Оплата</th><th></th></tr></thead><tbody>{queue.slice(0, 6).map((verification) => <tr key={verification.id}><td><p className="font-bold">{verification.company.name}</p><p className="text-xs text-slate-500">{verification.company.binIin}</p></td><td>{formatDate(verification.submittedAt)}</td><td>{verification.company.documents.length}</td><td><StatusBadge status={verification.company.payments[0]?.status ?? "PENDING"} /></td><td className="text-right"><ButtonLink href={`/admin/company/${verification.companyId}`} variant="ghost">Открыть</ButtonLink></td></tr>)}{queue.length === 0 ? <tr><td colSpan={5} className="text-center text-slate-500">Очередь пуста</td></tr> : null}</tbody></table></div></section>
  </div>;
}

