"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Store } from "lucide-react";
import { DEMO_ACCOUNTS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function login(email: string, password: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Не удалось войти");
      router.push(payload.data.role === "ADMIN" ? "/admin" : "/dashboard/company");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-3">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            disabled={pending}
            onClick={() => login(account.email, account.password)}
            className="group flex items-center gap-3 rounded-2xl border border-brand-900/10 bg-white p-4 text-left hover:border-brand-700/35 hover:shadow-sm disabled:opacity-50"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-800">
              {account.role === "ADMIN" ? <ShieldCheck className="size-5" /> : <Store className="size-5" />}
            </span>
            <span className="min-w-0 flex-1"><b className="block text-sm text-ink-950">{account.label}</b><small className="block truncate text-slate-500">{account.email}</small></span>
            <ArrowRight className="size-4 text-slate-300 group-hover:translate-x-0.5 group-hover:text-brand-700" />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />или вручную<span className="h-px flex-1 bg-slate-200" /></div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void login(String(form.get("email")), String(form.get("password")));
        }}
      >
        <label className="field-label">Email<input className="field" type="email" name="email" autoComplete="email" required /></label>
        <label className="field-label">Пароль<input className="field" type="password" name="password" autoComplete="current-password" minLength={6} required /></label>
        <Button type="submit" disabled={pending}>{pending ? "Входим…" : "Войти"}</Button>
      </form>
    </div>
  );
}

