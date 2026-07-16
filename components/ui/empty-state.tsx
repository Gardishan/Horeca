import { PackageOpen } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="surface-flat grid min-h-64 place-items-center p-8 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-sand-100 text-brand-900"><PackageOpen className="size-6" /></span>
        <h3 className="mt-4 text-lg font-bold text-ink-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

