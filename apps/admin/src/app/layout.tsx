import type { Metadata } from "next";
import { Readex_Pro } from "next/font/google";
import { getPrefs } from "@/lib/prefs";
import "./globals.css";

// One soft, rounded face for Arabic and Latin (identity "sea glass", PRD 12).
const sanadSans = Readex_Pro({
  variable: "--font-sanad",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "سَنَد — لوحة التحكم",
  description: "نظام تحضير الموظفين",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { lang, dir, theme } = await getPrefs();
  return (
    <html
      lang={lang}
      dir={dir}
      className={`${sanadSans.variable} ${theme === "dark" ? "dark" : ""} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
