import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

export function Alert({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children: ReactNode }) {
  const styles = {
    info: { wrap: "border-blue-200 bg-blue-50 text-blue-950", icon: Info },
    success: { wrap: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CheckCircle2 },
    warning: { wrap: "border-amber-200 bg-amber-50 text-amber-950", icon: AlertCircle },
    danger: { wrap: "border-red-200 bg-red-50 text-red-950", icon: AlertCircle },
  };
  const Icon = styles[tone].icon;
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${styles[tone].wrap}`} role="status">
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>{title ? <p className="font-bold">{title}</p> : null}<div className={title ? "mt-1 opacity-85" : ""}>{children}</div></div>
    </div>
  );
}

