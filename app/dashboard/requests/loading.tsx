export default function RequestsLoading() {
  return (
    <div role="status" aria-label="Загружаем заявки" className="grid gap-5">
      <p className="sr-only">Загружаем заявки покупателей…</p>
      <div aria-hidden="true" className="skeleton h-20 rounded-2xl" />
      <div aria-hidden="true" className="skeleton h-64 rounded-2xl" />
      <div aria-hidden="true" className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
