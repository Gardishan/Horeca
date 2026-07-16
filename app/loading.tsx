export default function Loading() {
  return (
    <main className="app-shell py-10" aria-label="Загрузка">
      <div className="skeleton h-10 w-72 rounded-xl" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton h-80 rounded-2xl" />)}
      </div>
    </main>
  );
}

