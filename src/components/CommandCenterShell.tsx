"use client";

import { useEffect, useState } from "react";
import ContentCalendar from "./ContentCalendar";
import BriefsPanel from "./BriefsPanel";

type Tab = "data" | "reports" | "calendar" | "briefs";
const TABS: { id: Tab; label: string }[] = [
  { id: "data", label: "מבט על ונתונים" },
  { id: "reports", label: "דוחות" },
  { id: "calendar", label: "לוח תוכן" },
  { id: "briefs", label: "בריפים" },
];

// Client shell: sub-section (Leaders / Bestie) + tab switching is pure client state → INSTANT, no
// server round-trip. Both sub-sections' data + report panels are rendered up front (server nodes)
// and toggled with CSS; calendar/briefs (client) mount per active sub. Deep links honored on mount.
export default function CommandCenterShell({ subs }: { subs: { id: string; label: string; data: React.ReactNode; report: React.ReactNode }[] }) {
  const [sub, setSub] = useState(subs[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("data");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("sub");
    const t = q.get("tab");
    if (s && subs.some((x) => x.id === s)) setSub(s);
    if (t === "calendar" || t === "briefs" || t === "reports" || t === "data") setTab(t as Tab);
  }, [subs]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Sub-section switcher — segmented control (platform style) */}
      <div className="inline-flex rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            aria-current={s.id === sub ? "page" : undefined}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${s.id === sub ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Tabs — underline (platform style) */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 pb-2 text-sm font-medium transition-colors ${t.id === tab ? "border-blue-600 text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Data: both sub-sections pre-rendered, CSS-toggled → instant sub-switch. */}
      <div className={tab === "data" ? "" : "hidden"}>
        <div className="mb-3 rounded-lg border border-[var(--panel-border)] bg-[var(--card)] px-4 py-2.5 text-[13px] text-[var(--muted)]">
          נתוני מדיה <b className="text-[var(--foreground)]">ממומנת</b> (Meta + Google). נתוני אורגני (אינסטגרם/פייסבוק/לינקדאין) יתווספו בשלב הבא.
        </div>
        {subs.map((s) => <div key={s.id} className={s.id === sub ? "" : "hidden"} dir="ltr">{s.data}</div>)}
      </div>

      {/* Reports (data + manager conclusions + send to the CEO). */}
      <div className={tab === "reports" ? "" : "hidden"}>
        {subs.map((s) => <div key={s.id} className={s.id === sub ? "" : "hidden"}>{s.report}</div>)}
      </div>

      {/* Calendar / briefs (client) — mount per active sub. */}
      {tab === "calendar" && <ContentCalendar key={sub} brandId={sub} />}
      {tab === "briefs" && <BriefsPanel key={sub} brandId={sub} />}
    </div>
  );
}
