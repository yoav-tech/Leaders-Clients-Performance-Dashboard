"use client";

import { useEffect, useState } from "react";
import ContentCalendar from "./ContentCalendar";
import BriefsPanel from "./BriefsPanel";

type Tab = "overview" | "calendar" | "briefs";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "מבט על ודוח" },
  { id: "calendar", label: "לוח תוכן" },
  { id: "briefs", label: "בריפים" },
];

// Client shell: sub-section (Leaders / Bestie) + tab switching is pure client state → INSTANT, no
// server round-trip. The unified overview (data + report in one, Argania-style) for both
// sub-sections is rendered up front (server node) and toggled with CSS; calendar/briefs mount per
// active sub. Deep links (?sub=&tab=) honored on mount.
export default function CommandCenterShell({ subs }: { subs: { id: string; label: string; view: React.ReactNode }[] }) {
  const [sub, setSub] = useState(subs[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("sub");
    const t = q.get("tab");
    if (s && subs.some((x) => x.id === s)) setSub(s);
    if (t === "calendar" || t === "briefs" || t === "overview") setTab(t as Tab);
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

      {/* Overview (data + report in one, Argania-style) — both sub-sections pre-rendered, CSS-toggled. */}
      <div className={tab === "overview" ? "" : "hidden"}>
        {subs.map((s) => <div key={s.id} className={s.id === sub ? "" : "hidden"}>{s.view}</div>)}
      </div>

      {/* Calendar / briefs (client) — mount per active sub. */}
      {tab === "calendar" && <ContentCalendar key={sub} brandId={sub} />}
      {tab === "briefs" && <BriefsPanel key={sub} brandId={sub} />}
    </div>
  );
}
