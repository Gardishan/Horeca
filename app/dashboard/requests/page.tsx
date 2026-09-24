import Link from "next/link";
import type { BuyerRequestStatus } from "@prisma/client";
import { listSupplierBuyerRequests } from "@/lib/services/buyer-requests";
import { formatDate, UNIT_LABELS } from "@/lib/constants";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

const statusLabels: Record<BuyerRequestStatus, string> = {
  NEW: "Новая",
  CONTACTED: "Связались с покупателем",
  CLOSED: "Закрыта",
  SPAM: "Спам",
};

export default async function SupplierRequestsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page } = await searchParams;
  const { items, pagination } = await listSupplierBuyerRequests(page);

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Кабинет поставщика" title="Заявки покупателей" description="Запросы по вашим товарам. Свяжитесь с покупателем по указанным контактам, чтобы обсудить предложение." />
      <p className="text-sm text-slate-500">Всего заявок: {pagination.total}</p>
      {items.length ? (
        <div className="grid gap-5">
          {items.map((request) => (
            <article key={request.id} className="surface-flat p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold"><Link className="hover:text-brand-700 hover:underline" href={`/dashboard/products/${request.product.id}/edit`}>{request.product.name}</Link></h2>
                  <p className="mt-1 text-sm text-slate-500">Количество: {request.quantity} {UNIT_LABELS[request.product.unit]}</p>
                </div>
                <div className="grid justify-items-end gap-2">
                  <StatusBadge status={request.status} label={statusLabels[request.status]} />
                  <time className="text-xs text-slate-500" dateTime={request.createdAt.toISOString()}>{formatDate(request.createdAt)}</time>
                </div>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Покупатель</dt><dd className="mt-1 break-words font-semibold">{request.buyerName}</dd></div>
                <div><dt className="text-slate-500">Компания</dt><dd className="mt-1 break-words font-semibold">{request.buyerCompany}</dd></div>
                <div><dt className="text-slate-500">Телефон</dt><dd className="mt-1 break-words"><a className="font-semibold text-brand-800 hover:underline" href={`tel:${request.phone}`}>{request.phone}</a></dd></div>
                <div><dt className="text-slate-500">Email</dt><dd className="mt-1 break-all"><a className="font-semibold text-brand-800 hover:underline" href={`mailto:${request.email}`}>{request.email}</a></dd></div>
              </dl>
              <div className="mt-5 border-t pt-4"><h3 className="text-sm font-bold">Сообщение покупателя</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{request.message}</p></div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={pagination.total ? "На этой странице нет заявок" : "Заявок пока нет"}
          description={pagination.total ? "Вернитесь к первой странице, чтобы просмотреть полученные запросы." : "Когда покупатель отправит запрос по вашему товару, здесь появятся его контакты и сообщение."}
          action={pagination.total ? <ButtonLink href="/dashboard/requests">К первой странице</ButtonLink> : <ButtonLink href="/dashboard/products" variant="secondary">Товары компании</ButtonLink>}
        />
      )}
      {pagination.pages > 1 && pagination.page <= pagination.pages ? (
        <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Страницы заявок">
          {pagination.page > 1 ? <ButtonLink href={`/dashboard/requests?page=${pagination.page - 1}`} variant="secondary">Предыдущая страница заявок</ButtonLink> : null}
          <span className="text-sm text-slate-600" aria-current="page">{pagination.page} из {pagination.pages}</span>
          {pagination.page < pagination.pages ? <ButtonLink href={`/dashboard/requests?page=${pagination.page + 1}`} variant="secondary">Следующая страница заявок</ButtonLink> : null}
        </nav>
      ) : null}
    </div>
  );
}
