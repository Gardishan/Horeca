export default function DashboardLoading() {
  return <div className="grid gap-5"><div className="skeleton h-16 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-32 rounded-2xl" />)}</div><div className="skeleton h-80 rounded-2xl" /></div>;
}

