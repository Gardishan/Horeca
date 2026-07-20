import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

function buttonClass(variant: ButtonVariant = "primary", className = "") {
  const base = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55";
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-900 text-white shadow-sm hover:bg-brand-800 hover:-translate-y-px",
    secondary: "border border-brand-900/15 bg-white text-brand-950 hover:border-brand-700/35 hover:bg-brand-50",
    ghost: "text-brand-900 hover:bg-brand-50",
    danger: "bg-red-700 text-white hover:bg-red-800",
  };
  return `${base} ${variants[variant]} ${className}`;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: ButtonVariant; className?: string }) {
  return <Link href={href} className={buttonClass(variant, className)}>{children}</Link>;
}
