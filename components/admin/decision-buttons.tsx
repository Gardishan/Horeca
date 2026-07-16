"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Decision = { endpoint: string; label: string; kind: "approve" | "reject" | "reupload"; commentRequired?: boolean; confirm?: string };

export function DecisionButtons({ decisions }: { decisions: Decision[] }) {
  const router = useRouter(); const [pending, setPending] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(false);
  const icons = { approve: Check, reject: X, reupload: RotateCcw };
  return (
    <div><div className="flex flex-wrap gap-2">{decisions.map((decision) => { const Icon = icons[decision.kind]; return <Button key={decision.endpoint} type="button" variant={decision.kind === "approve" ? "secondary" : decision.kind === "reject" ? "danger" : "ghost"} disabled={pending !== ""} onClick={async () => { if (decision.confirm && !window.confirm(decision.confirm)) return; const comment = window.prompt(decision.commentRequired ? "Комментарий обязателен:" : "Комментарий (необязательно):", ""); if (comment === null || (decision.commentRequired && !comment.trim())) return; setPending(decision.endpoint); setMessage(""); const response = await fetch(decision.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) }); const payload = await response.json(); setMessage(response.ok ? "Решение сохранено" : payload.error?.message ?? "Ошибка"); setError(!response.ok); setPending(""); if (response.ok) router.refresh(); }}><Icon className="size-3.5" />{pending === decision.endpoint ? "…" : decision.label}</Button>; })}</div>{message ? <p className={`mt-2 text-xs ${error ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}</div>
  );
}

