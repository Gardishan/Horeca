import { STATUS_LABELS, STATUS_TONES } from "@/lib/constants";

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  const tones = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-bold ${tones[tone]}`}>
      <span className="size-1.5 rounded-full bg-current opacity-75" aria-hidden="true" />
      {label ?? STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

