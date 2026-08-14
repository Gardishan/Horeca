import { isBetaEnvironment } from "@/lib/beta-safety";

export function BetaBanner() {
  if (!isBetaEnvironment()) return null;
  return (
    <aside className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-semibold leading-5 text-amber-950">
      Контролируемая MVP Beta: используйте только демонстрационные данные. Реальные платежи и
      реальные документы запрещены; коммерческий запуск не разрешён.
    </aside>
  );
}
