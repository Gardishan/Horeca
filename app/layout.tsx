import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "HoReCa KZ — проверенные B2B-поставщики", template: "%s · HoReCa KZ" },
  description: "B2B-каталог проверенных поставщиков для ресторанов, кафе, отелей и кейтеринга Казахстана.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

