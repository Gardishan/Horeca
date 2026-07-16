"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="app-shell grid min-h-[65vh] place-items-center py-16 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-700"><AlertTriangle className="size-7" /></span><h1 className="mt-5 text-2xl font-extrabold">Не удалось загрузить данные</h1><p className="mt-2 text-sm leading-6 text-slate-500">Проверьте подключение к базе данных или повторите запрос. Технические подробности не раскрываются пользователю.</p><Button className="mt-6" onClick={reset}>Повторить</Button></div></main>;
}

