"use client";

import { useEffect, useState } from "react";
import ContentCalendar from "./ContentCalendar";
import BriefsPanel from "./BriefsPanel";

type Tab = "data" | "calendar" | "briefs";
const TABS: { id: Tab; label: string }[] = [
  { id: "data", label: "מבט על ונתונים" },
  { id: "calendar", label: "לוח תוכן" },
  { id: "briefs", label: "בריפים" },
];

// Client shell: sub-section (Leaders / Bestie) + tab switching is pure client state, so switching
// is INSTANT — no server round-trip. Both sub-sections' data panels are rendered up front (server
// components passed in as `subs[].data`) and toggled with CSS; the calendar/briefs (client) mount
// per active sub. Deep links (?sub=&tab=) are honored once on mount.
export default function CommandCenterShell({ subs }: { subs: { id: string; label: string; data: React.ReactNode }[] }) {
  const [sub, setSub] = useState(subs[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("data");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("sub");
    const t = q.get("tab");
    if (s && subs.some((x) => x.id === s)) setSub(s);
    if (t === "calendar" || t === "briefs" || t === "data") setTab(t);
  }, [subs]);

  const pill = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-blue-600 text-white" : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"}`;
  const tabCls = (active: boolean) =>
    `border-b-2 px-3 pb-2 text-sm font-medium ${active ? "border-blue-600 text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {subs.map((s) => (
          <button key={s.id} onClick={() => setSub(s.id)} className={pill(s.id === sub)}>{s.label}</button>
        ))}
      </div>

      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tabCls(t.id === tab)}>{t.label}</button>
        ))}
      </div>

      {/* Data: both sub-sections pre-rendered, shown/hidden with CSS → instant sub-switch. */}
      <div className={tab === "data" ? "" : "hidden"}>
        <div className="mb-3 rounded-lg border border-[var(--panel-border)] bg-[var(--card)] px-4 py-2.5 text-[13px] text-[var(--muted)]">
          נתוני מדיה <b className="text-[var(--foreground)]">ממומנת</b> (Meta + Google). נתוני אורגני (אינסטגרם/פייסבוק/לינקדאין) יתווספו בשלב הבא.
        </div>
        {subs.map((s) => (
          <div key={s.id} className={s.id === sub ? "" : "hidden"} dir="ltr">{s.data}</div>
        ))}
      </div>

      {/* Calendar / briefs (client) — mount per active sub. */}
      {tab === "calendar" && <ContentCalendar key={sub} brandId={sub} />}
      {tab === "briefs" && <BriefsPanel key={sub} brandId={sub} />}
    </div>
  );
}
