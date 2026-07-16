"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

export function ApiActionButton({ endpoint, children, body = {}, method = "POST", variant = "secondary", confirmMessage, successMessage, className }: { endpoint: string; children: ReactNode; body?: Record<string, unknown>; method?: "POST" | "PUT"; variant?: ButtonVariant; confirmMessage?: string; successMessage?: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return (
    <span className="inline-grid gap-1">
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={pending}
        onClick={async () => {
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          setPending(true); setMessage(""); setError(false);
          const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const reasons = payload.error?.details?.reasons;
            setMessage(Array.isArray(reasons) ? reasons.join(" · ") : payload.error?.message ?? "Операция не выполнена");
            setError(true);
          } else {
            setMessage(successMessage ?? "Готово");
            router.refresh();
          }
          setPending(false);
        }}
      >{pending ? "Подождите…" : children}</Button>
      {message ? <small className={`max-w-xs text-xs ${error ? "text-red-700" : "text-emerald-700"}`}>{message}</small> : null}
    </span>
  );
}

