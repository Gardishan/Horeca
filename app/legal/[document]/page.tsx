import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { LEGAL_DOCUMENTS } from "@/lib/legal-content";

export function generateStaticParams() { return Object.keys(LEGAL_DOCUMENTS).map((document) => ({ document })); }

export async function generateMetadata({ params }: { params: Promise<{ document: string }> }): Promise<Metadata> {
  const item = LEGAL_DOCUMENTS[(await params).document]; return item ? { title: item.title, description: item.summary } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const documentKey = (await params).document; const document = LEGAL_DOCUMENTS[documentKey]; if (!document) notFound();
  return <main className="app-shell grid gap-8 py-10 lg:grid-cols-[230px_minmax(0,760px)] lg:justify-center"><aside className="h-fit rounded-2xl border bg-white p-3 lg:sticky lg:top-24"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Документы</p>{Object.entries(LEGAL_DOCUMENTS).map(([key, item]) => <Link key={key} href={`/legal/${key}`} className={`block rounded-xl px-3 py-2.5 text-sm font-semibold ${key === documentKey ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-brand-50"}`}>{item.title.replace(" для поставщиков", "")}</Link>)}</aside><article className="surface p-6 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Версия MVP · Казахстан</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] md:text-4xl">{document.title}</h1><p className="mt-3 text-slate-600">{document.summary}</p><div className="mt-7 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><p><b>Юридический дисклеймер.</b> Документ является шаблоном для MVP и должен быть проверен юристом в Казахстане перед коммерческим запуском.</p></div><div className="mt-9 grid gap-8">{document.sections.map((section) => <section key={section.title}><h2 className="text-lg font-extrabold">{section.title}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-3 leading-7 text-slate-600">{paragraph}</p>)}{section.bullets ? <ul className="mt-3 grid gap-2 pl-5 text-slate-600">{section.bullets.map((bullet) => <li key={bullet} className="list-disc pl-1 leading-7">{bullet}</li>)}</ul> : null}</section>)}</div></article></main>;
}

