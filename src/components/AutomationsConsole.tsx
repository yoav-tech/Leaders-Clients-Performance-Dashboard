"use client";

import { useState } from "react";

interface Row { key: string; name: string; scheduleHe: string; description: string; enabled: boolean }

export default function AutomationsConsole({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState<string>("");
  const [result, setResult] = useState<Record<string, string>>({});

  const toggle = async (key: string, enabled: boolean) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, enabled } : r))); // optimistic
    const r = await fetch("/api/admin/automations/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, enabled }) });
    if (!r.ok) setRows((rs) => rs.map((x) => (x.key === key ? { ...x, enabled: !enabled } : x))); // revert
  };

  const run = async (key: string) => {
    setBusy(key); setResult((p) => ({ ...p, [key]: "" }));
    try {
      const r = await fetch("/api/admin/automations/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const j = await r.json();
      const inner = j.result ?? {};
      const summary = inner.skipped ? `דולג: ${inner.skipped}` : inner.emailed?.length ? `נשלח ל-${inner.emailed.length}` : inner.sent?.length ? `נשלח: ${inner.sent.join(", ")}` : inner.posted ? "פורסם" : r.ok ? "בוצע ✓" : `שגיאה ${j.status ?? ""}`;
      setResult((p) => ({ ...p, [key]: summary }));
    } catch (e) {
      setResult((p) => ({ ...p, [key]: `שגיאה: ${e instanceof Error ? e.message : String(e)}` }));
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-sm text-[var(--muted)]">שליטה בכל האוטומציות המתוזמנות — הפעלה/כיבוי והרצה ידנית. כיבוי משאיר את הקוד אבל מדלג על ההרצה המתוזמנת.</p>
      {rows.map((a) => (
        <div key={a.key} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-[200px] flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{a.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.enabled ? "bg-[var(--good)]/15 text-[var(--good)]" : "bg-[var(--muted)]/20 text-[var(--muted)]"}`}>{a.enabled ? "פעיל" : "כבוי"}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--muted)]">{a.description}</div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">⏱ {a.scheduleHe}</div>
          </div>
          <div className="flex items-center gap-3">
            {result[a.key] && <span className="text-[11px] text-[var(--muted)]">{result[a.key]}</span>}
            <button onClick={() => run(a.key)} disabled={busy === a.key} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium hover:border-[var(--muted)] disabled:opacity-50">{busy === a.key ? "מריץ…" : "הרץ עכשיו"}</button>
            <button
              onClick={() => toggle(a.key, !a.enabled)}
              role="switch"
              aria-checked={a.enabled}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${a.enabled ? "bg-[var(--good)]" : "bg-[var(--muted)]/40"}`}
              title={a.enabled ? "כבה" : "הפעל"}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${a.enabled ? "left-0.5" : "right-0.5"}`} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
