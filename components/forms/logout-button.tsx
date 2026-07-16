"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-white hover:text-brand-900 disabled:opacity-50"
      aria-label="Выйти"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/catalog");
        router.refresh();
      }}
    ><LogOut className="size-4" /></button>
  );
}

