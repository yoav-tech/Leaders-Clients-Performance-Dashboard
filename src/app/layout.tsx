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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
