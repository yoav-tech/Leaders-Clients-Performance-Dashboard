import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leaders — Clients Performance",
  description: "One-screen paid-media performance across Leaders' e-commerce clients",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
