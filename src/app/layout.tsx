import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

// Rubik — geometric sans with full Hebrew + Latin coverage; self-hosted by next/font (no external
// request, CSP-safe). Tabular figures kept via the `tabular-nums` utility on data tables.
const rubik = Rubik({
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Leaders — Clients Performance",
  description: "One-screen paid-media performance across Leaders' e-commerce clients",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={rubik.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme', t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
