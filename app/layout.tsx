import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "HoReCa KZ — проверенные B2B-поставщики", template: "%s · HoReCa KZ" },
  description: "B2B-каталог проверенных поставщиков для ресторанов, кафе, отелей и кейтеринга Казахстана.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="ru">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
