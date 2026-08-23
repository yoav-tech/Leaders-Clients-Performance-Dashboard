import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { getServerSession } from "@/lib/serverSession";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Clients default to the light theme; the team defaults to dark. An explicit toggle choice
  // (stored in localStorage) always wins. Not signed in (login screen) → dark, as designed.
  const session = await getServerSession();
  const def = session?.role === "client" ? "light" : "dark";
  return (
    <html lang="en" className={rubik.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var t=localStorage.getItem('theme');var d='${def}';document.documentElement.setAttribute('data-theme', t==='light'?'light':t==='dark'?'dark':d);}catch(e){document.documentElement.setAttribute('data-theme','${def}');}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
