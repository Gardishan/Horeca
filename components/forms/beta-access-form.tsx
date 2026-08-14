"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function BetaAccessForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        const accessToken = String(new FormData(event.currentTarget).get("accessToken") ?? "");
        const response = await fetch("/api/beta-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const payload = await response.json();
        if (response.ok) {
          router.replace(nextPath);
          router.refresh();
        } else {
          setError(payload.error?.message ?? "Не удалось открыть Beta");
          setPending(false);
        }
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <label className="field-label">
        Код приглашения
        <input
          className="field"
          name="accessToken"
          type="password"
          autoComplete="one-time-code"
          minLength={32}
          maxLength={512}
          required
        />
      </label>
      <Button type="submit" disabled={pending}>
        <LockKeyhole className="size-4" />
        {pending ? "Проверяем…" : "Открыть контролируемую Beta"}
      </Button>
    </form>
  );
}
