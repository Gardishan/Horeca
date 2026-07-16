import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, note, icon: Icon, tone = "green" }: { label: string; value: string | number; note?: string; icon: LucideIcon; tone?: "green" | "amber" | "blue" | "red" }) {
  const tones = {
    green: "bg-brand-100 text-brand-900",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
  };
  return (
    <div className="surface-flat p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-950">{value}</p>
          {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-5" /></span>
      </div>
    </div>
  );
}

