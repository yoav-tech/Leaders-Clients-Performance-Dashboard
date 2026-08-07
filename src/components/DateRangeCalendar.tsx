"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RANGE_PRESETS, type RangeKey } from "@/lib/dates";

// ---- date helpers (UTC-based ISO YYYY-MM-DD, matches the rest of the app) ----
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const firstWeekday = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).getUTCDay(); // 0=Sun
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (s: string) => { const { y, m, d } = parse(s); return `${d}.${m + 1}.${y}`; };
const shiftDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const WEEK = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export default function DateRangeCalendar({
  activeKey,
  from,
  to,
  brand,
}: {
  activeKey: RangeKey;
  from: string;
  to: string;
  brand?: string;
}) {
  const router = useRouter();
  const brandQ = brand ? `&brand=${brand}` : "";
  const [open, setOpen] = useState(false);
  const [selStart, setSelStart] = useState(from);
  const [selEnd, setSelEnd] = useState(to);
  const startAnchor = parse(from);
  const [view, setView] = useState<{ y: number; m: number }>({ y: startAnchor.y, m: startAnchor.m });
  const ref = useRef<HTMLDivElement>(null);
  const today = todayIso();

  useEffect(() => { setSelStart(from); setSelEnd(to); }, [from, to]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = useMemo(() => {
    if (activeKey !== "custom") return RANGE_PRESETS.find((p) => p.key === activeKey)?.label ?? `${fmt(from)} – ${fmt(to)}`;
    return from === to ? fmt(from) : `${fmt(to)} – ${fmt(from)}`;
  }, [activeKey, from, to]);

  const goPreset = (key: RangeKey) => { setOpen(false); router.push(`/?range=${key}${brandQ}`); };
  const applyCustom = (s: string, e: string) => {
    const lo = s <= e ? s : e, hi = s <= e ? e : s;
    setOpen(false);
    router.push(`/?range=custom&from=${lo}&to=${hi}${brandQ}`);
  };
  const step = (delta: number) => {
    const nextTo = shiftDays(to, delta);
    if (delta > 0 && nextTo > today) return;
    router.push(`/?range=custom&from=${shiftDays(from, delta)}&to=${nextTo}${brandQ}`);
  };

  // Range-selection: first click sets start & clears end; second click sets the end.
  const onDay = (day: string) => {
    if (!selStart || (selStart && selEnd)) { setSelStart(day); setSelEnd(""); }
    else { setSelStart(selStart <= day ? selStart : day); setSelEnd(selStart <= day ? day : selStart); }
  };

  const grid = useMemo(() => {
    const { y, m } = view;
    const lead = firstWeekday(y, m);
    const total = daysInMonth(y, m);
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(iso(y, m, d));
    return cells;
  }, [view]);

  const lo = selStart && selEnd ? (selStart <= selEnd ? selStart : selEnd) : selStart;
  const hi = selStart && selEnd ? (selStart <= selEnd ? selEnd : selStart) : selStart;
  const inRange = (d: string) => lo && hi && d >= lo && d <= hi;

  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30";

  return (
    <div className="relative flex items-center gap-1.5" ref={ref} dir="rtl">
      <button onClick={() => step(-1)} className={btn} title="יום אחורה">▶</button>
      <button onClick={() => step(1)} disabled={to >= today} className={btn} title="יום קדימה">◀</button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)]"
      >
        📅 {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 flex w-[520px] max-w-[92vw] flex-col gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-xl sm:flex-row">
          {/* Presets */}
          <div className="flex flex-row flex-wrap gap-1 sm:w-40 sm:flex-col sm:border-l sm:border-[var(--card-border)] sm:pl-3">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => goPreset(p.key)}
                className={`rounded-md px-2 py-1.5 text-right text-sm transition-colors ${activeKey === p.key ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} className={btn}>▶</button>
              <div className="text-sm font-semibold">{HE_MONTHS[view.m]} {view.y}</div>
              <button onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} className={btn}>◀</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-[var(--muted)]">
              {WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((d, i) => {
                if (!d) return <div key={i} />;
                const future = d > today;
                const isEdge = d === lo || d === hi;
                return (
                  <button
                    key={d}
                    disabled={future}
                    onClick={() => onDay(d)}
                    className={`h-8 rounded-md text-xs transition-colors ${future ? "text-[var(--muted)]/40" : isEdge ? "bg-blue-600 text-white" : inRange(d) ? "bg-blue-600/20 text-[var(--foreground)]" : "text-[var(--foreground)] hover:bg-[var(--background)]"}`}
                  >
                    {parse(d).d}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-[var(--muted)]">{selStart ? fmt(selStart) : "—"} ← {selEnd ? fmt(selEnd) : (selStart ? fmt(selStart) : "—")}</div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">ביטול</button>
                <button
                  onClick={() => applyCustom(selStart, selEnd || selStart)}
                  disabled={!selStart}
                  className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40"
                >
                  החל
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
