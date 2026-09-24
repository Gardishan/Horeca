"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function RequestsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid gap-5">
      <Alert tone="danger" title="Не удалось загрузить заявки">Повторите попытку или откройте первую страницу заявок.</Alert>
      <div className="flex flex-wrap gap-3"><Button onClick={reset}>Повторить</Button><ButtonLink href="/dashboard/requests" variant="secondary">К первой странице</ButtonLink></div>
    </div>
  );
}
