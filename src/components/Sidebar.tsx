"use client";

import { useState } from "react";
import Link from "next/link";
import LeadersLogo from "./LeadersLogo";
import ThemeToggle from "./ThemeToggle";
import LogoutButton from "./LogoutButton";

interface BrandOpt { id: string; name: string }

export default function Sidebar({
  brands,
  activeBrand,
  activeSection,
  isAdmin,
  rangeQuery,
  accountLabel,
  accountSub,
}: {
  brands: BrandOpt[];
  activeBrand: string;
  activeSection: "brands" | "admin" | "media-plan" | "account";
  isAdmin: boolean;
  rangeQuery: string;
  accountLabel: string;
  accountSub: string;
}) {
  const [openMobile, setOpenMobile] = useState(false);
  const close = () => setOpenMobile(false);

  const groupTitle = "px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]";
  const item = (active: boolean) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-[var(--sidebar-active)] font-medium text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"}`;

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-4">
        <LeadersLogo height={26} />
      </div>

      <nav aria-label="ניווט ראשי" className="flex-1 overflow-y-auto px-2">
        <div className={groupTitle}>לקוחות</div>
        <ul className="space-y-1.5">
          {brands.map((b) => {
            const active = activeSection === "brands" && activeBrand === b.id;
            return (
              <li key={b.id}>
                <Link
                  href={`/?brand=${b.id}${rangeQuery}`}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`nav-bubble ${active ? "nav-bubble-active" : ""}`}
                >
                  <span className="nav-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--muted)]" />
                  {b.name}
                </Link>
              </li>
            );
          })}
          {brands.length === 0 && <li className="px-3 py-2 text-xs text-[var(--muted)]">אין מותגים</li>}
        </ul>

        {isAdmin && (
          <>
            <div className={groupTitle}>ניהול</div>
            <ul className="space-y-1.5">
              <li>
                <Link
                  href="/admin"
                  onClick={close}
                  aria-current={activeSection === "admin" ? "page" : undefined}
                  className={`nav-bubble ${activeSection === "admin" ? "nav-bubble-active" : ""}`}
                >
                  <span className="nav-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--muted)]" />
                  הרשאות
                </Link>
              </li>
              <li>
                <Link
                  href="/media-plan"
                  onClick={close}
                  aria-current={activeSection === "media-plan" ? "page" : undefined}
                  className={`nav-bubble ${activeSection === "media-plan" ? "nav-bubble-active" : ""}`}
                >
                  <span className="nav-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--muted)]" />
                  פריסות מדיה
                </Link>
              </li>
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-[var(--card-border)] p-2">
        <Link href="/account" onClick={close} aria-current={activeSection === "account" ? "page" : undefined} className={item(activeSection === "account") + " mb-1"}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-active)] text-xs font-bold">{accountLabel.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-[var(--foreground)]">{accountLabel}</span>
            <span className="block truncate text-[11px] text-[var(--muted)]">{accountSub}</span>
          </span>
        </Link>
        <div className="flex items-center justify-between px-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar (right) */}
      <aside className="app-sidebar hidden lg:sticky lg:top-0 lg:block lg:h-screen">{nav}</aside>

      {/* Mobile: hamburger + drawer */}
      <button
        onClick={() => setOpenMobile(true)}
        className="fixed right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] lg:hidden"
        aria-label="פתח תפריט"
      >
        ☰
      </button>
      {openMobile && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={close}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="app-sidebar absolute right-0 top-0 h-full" onClick={(e) => e.stopPropagation()}>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
