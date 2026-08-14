import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { BetaAccessForm } from "@/components/forms/beta-access-form";
import {
  BETA_ACCESS_COOKIE,
  isBetaEnvironment,
  safeBetaReturnPath,
  verifyBetaAccessCookie,
} from "@/lib/beta-safety";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Доступ к контролируемой Beta",
  robots: { index: false, follow: false },
};

export default async function BetaAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isBetaEnvironment()) redirect("/catalog");
  const nextPath = safeBetaReturnPath((await searchParams).next);
  const accessCookie = (await cookies()).get(BETA_ACCESS_COOKIE)?.value;
  if (verifyBetaAccessCookie(accessCookie)) redirect(nextPath);

  return (
    <main className="app-shell grid min-h-[calc(100vh-4rem)] place-items-center py-12">
      <section className="surface w-full max-w-lg p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-900">
          <LockKeyhole className="size-6" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
          Controlled MVP Beta
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Доступ по приглашению</h1>
        <p className="mb-6 mt-3 text-sm leading-6 text-slate-600">
          Среда предназначена только для демонстрационных данных. Не загружайте реальные
          документы и не используйте её для реальных платежей.
        </p>
        <BetaAccessForm nextPath={nextPath} />
      </section>
    </main>
  );
}
