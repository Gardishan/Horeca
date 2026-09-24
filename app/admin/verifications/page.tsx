import { requireRole } from "@/lib/auth";
import { ADMIN_QUEUE_LIMIT, listAdminVerifications } from "@/lib/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DecisionButtons } from "@/components/admin/decision-buttons";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/constants";

type QueuedVerification = Awaited<ReturnType<typeof listAdminVerifications>>[number];
type ReviewDocument = QueuedVerification["documents"][number];

function QueueLimitNote({ shown }: { shown: number }) {
  return shown >= ADMIN_QUEUE_LIMIT ? <p className="text-sm text-slate-500">{`Показаны первые ${ADMIN_QUEUE_LIMIT} по времени поступления. Следующие появятся после решения по ним.`}</p> : null;
}

function DocumentTable({ documents, emptyText }: { documents: ReviewDocument[]; emptyText: string }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Документ</th><th>Тип</th><th>Антивирус</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
    {documents.map((document) => <tr key={document.id}><td><a className="font-semibold text-brand-800 hover:underline" href={`/api/admin/documents/${document.id}/download`}>{document.originalName}</a></td><td>{document.type}</td><td><StatusBadge status={document.antivirusStatus} /></td><td><StatusBadge status={document.status} /></td><td>{document.status === "UNDER_REVIEW" ? <DecisionButtons decisions={[{ endpoint: `/api/admin/documents/${document.id}/approve`, label: "Одобрить", kind: "approve" }, { endpoint: `/api/admin/documents/${document.id}/request-reupload`, label: "Перезагрузить", kind: "reupload", commentRequired: true }, { endpoint: `/api/admin/documents/${document.id}/reject`, label: "Отклонить", kind: "reject", commentRequired: true }]} /> : <span className="text-xs text-slate-500">{document.adminComment ?? "Решение принято"}</span>}</td></tr>)}
    {documents.length === 0 ? <tr><td colSpan={5} className="text-center text-slate-500">{emptyText}</td></tr> : null}
  </tbody></table></div>;
}

function VerificationCard({ verification }: { verification: QueuedVerification }) {
  return <section className="surface-flat p-5" aria-label={`Проверка компании ${verification.company.name}`}>
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold">{verification.company.name}</h3><StatusBadge status={verification.status} /></div><p className="mt-1 text-sm text-slate-500">БИН {verification.company.binIin} · {verification.company.city} · отправлено {formatDate(verification.submittedAt)}</p></div><ButtonLink href={`/admin/company/${verification.companyId}`} variant="ghost">Карточка компании</ButtonLink></div>
    <h4 className="mt-5 mb-2 text-sm font-bold">Документы этой попытки</h4>
    <DocumentTable documents={verification.documents} emptyText="В этой попытке нет документов" />
    {verification.earlierDocuments.length ? <><h4 className="mt-5 mb-1 text-sm font-bold">Документы предыдущих попыток</h4><p className="mb-2 text-xs text-slate-500">Одобренные документы показаны для контекста; документы на проверке по-прежнему требуют решения.</p><DocumentTable documents={verification.earlierDocuments} emptyText="" /></> : null}
    <div className="mt-5 flex flex-col gap-4 rounded-xl bg-sand-50 p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-bold">Оплата: <StatusBadge status={verification.company.payments[0]?.status ?? "PENDING"} /></p><p className="mt-1 text-xs text-slate-500">Тариф: {verification.company.subscriptions[0]?.plan.code ?? "не выбран"}</p>{verification.company.payments[0]?.hasProof ? <a className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-brand-800 hover:underline" href={`/api/admin/payments/${verification.company.payments[0].id}/proof`}>Скачать подтверждение оплаты</a> : null}</div>{verification.company.payments[0] ? <DecisionButtons decisions={[{ endpoint: `/api/admin/payments/${verification.company.payments[0].id}/confirm`, label: "Подтвердить оплату", kind: "approve", confirm: "Подтвердить оплату и активировать подписку?" }, { endpoint: `/api/admin/payments/${verification.company.payments[0].id}/reject`, label: "Отклонить оплату", kind: "reject", commentRequired: true }]} /> : null}</div>
    {verification.status === "PENDING" ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><p className="text-sm font-bold">Итоговое решение по верификации</p><DecisionButtons decisions={[{ endpoint: `/api/admin/verifications/${verification.id}/approve`, label: "Одобрить", kind: "approve", confirm: "Одобрить верификацию компании?" }, { endpoint: `/api/admin/verifications/${verification.id}/request-reupload`, label: "Запросить документы", kind: "reupload", commentRequired: true }, { endpoint: `/api/admin/verifications/${verification.id}/reject`, label: "Отклонить", kind: "reject", commentRequired: true }]} /></div> : null}
  </section>;
}

export default async function AdminVerificationsPage() {
  await requireRole("ADMIN");
  const verifications = await listAdminVerifications();
  return <div className="grid gap-7"><PageHeader eyebrow="Trust & Safety" title="Верификации" description="Проверяйте документы текущей попытки и оплату по отдельности, затем принимайте решение по компании." />
    <section className="grid gap-5" aria-labelledby="verification-queue-heading"><h2 id="verification-queue-heading" className="text-lg font-extrabold">Компании на проверке</h2><QueueLimitNote shown={verifications.length} />
      {verifications.length ? verifications.map((verification) => <VerificationCard key={verification.id} verification={verification} />) : <div className="surface-flat p-10 text-center text-slate-500">Нет компаний, ожидающих проверки.</div>}
    </section>
  </div>;
}
