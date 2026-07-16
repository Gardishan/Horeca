import Link from "next/link";
import { Search } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listAdminCompanies } from "@/lib/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("ADMIN"); const raw = await searchParams; const search = Array.isArray(raw.search) ? raw.search[0] : raw.search; const status = (Array.isArray(raw.status) ? raw.status[0] : raw.status) as never;
  const companies = await listAdminCompanies({ search, status: status || undefined });
  return <div className="grid gap-7"><PageHeader eyebrow="Поставщики" title="Компании" description="Поиск по названию, БИН и городу; управление статусами и профилем." />
    <form className="surface-flat flex flex-col gap-3 p-4 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><input className="field pl-9" name="search" defaultValue={search} placeholder="Название, БИН или город" /></label><select className="field sm:w-48" name="status" defaultValue={status ?? ""}><option value="">Все статусы</option><option value="DRAFT">Черновик</option><option value="PENDING_REVIEW">На проверке</option><option value="ACTIVE">Активные</option><option value="BLOCKED">Заблокированные</option><option value="REJECTED">Отклонённые</option></select><button className="rounded-xl bg-brand-900 px-5 py-2 text-sm font-bold text-white">Найти</button></form>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Компания</th><th>БИН</th><th>Город</th><th>Тариф</th><th>Компания</th><th>Верификация</th><th>Обновлена</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><Link className="font-bold hover:text-brand-700" href={`/admin/company/${company.id}`}>{company.name}</Link><p className="text-xs text-slate-500">{company.owner.email}</p></td><td>{company.binIin}</td><td>{company.city}</td><td>{company.subscriptions[0]?.plan.code ?? "—"}</td><td><StatusBadge status={company.status} /></td><td><StatusBadge status={company.verificationStatus} /></td><td>{formatDate(company.updatedAt)}</td></tr>)}{companies.length === 0 ? <tr><td colSpan={7} className="text-center text-slate-500">Компании не найдены</td></tr> : null}</tbody></table></div>
  </div>;
}

