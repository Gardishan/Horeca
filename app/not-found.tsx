import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="app-shell grid min-h-[70vh] place-items-center py-16 text-center">
      <div><p className="text-sm font-bold text-brand-700">404</p><h1 className="mt-2 text-4xl font-extrabold tracking-tight">Страница не найдена</h1><p className="mx-auto mt-3 max-w-md text-slate-500">Возможно, объект был скрыт, перемещён или ссылка устарела.</p><div className="mt-6"><ButtonLink href="/catalog">Вернуться в каталог</ButtonLink></div></div>
    </main>
  );
}

