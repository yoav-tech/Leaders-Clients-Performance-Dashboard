"use client";

import { useEffect, useState } from "react";
import { formatIls, formatPct } from "@/lib/metrics";

// Calendar-driven awareness-budget overview for media-plan brands (e.g. Style). The monthly
// budget is fixed (shown as-is); spend is live for the picked range and the pace is measured
// against the calendar month of the range end — month-to-date spend vs day-of-month elapsed.

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};
const daysInclusive = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
function paceTone(spendPct: number | null, timePct: number): string {
  if (spendPct === null || timePct <= 0) return "none";
  const r = spendPct / timePct;
  return r >= 0.95 ? "good" : r >= 0.75 ? "warn" : "bad";
}

export default function MediaPlanBudgetOverview({
  brandId,
  brandName,
  from,
  to,
  today,
  monthlyBudget,
}: {
  brandId: string;
  brandName: string;
  from: string;
  to: string;
  today: string; // server "today" (Israel-local) — avoids client timezone drift
  monthlyBudget: number;
}) {
  const [spend, setSpend] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/report/awareness?brand=${encodeURIComponent(brandId)}&from=${from}&to=${to}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !cancelled && setSpend(j?.report?.totals?.spend ?? 0))
        .catch(() => !cancelled && setSpend(0))
        .finally(() => !cancelled && setLoading(false));
    };
    load();
    const iv = setInterval(load, 90_000); // keep live, same cadence as the tables
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [brandId, from, to]);

  // Pace against the calendar month of the range end: month-to-date spend vs day-of-month elapsed.
  // Budget stays the fixed monthly figure. (this_month → to=today → mid-month pace; last_month →
  // to=last day → 100% time.)
  const [y, m] = to.split("-").map(Number);
  const monthStart = to.slice(0, 8) + "01";
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based → day 0 of next month
  const asOf = to < today ? to : today; // don't count days that haven't happened yet
  const elapsedDays = Math.max(0, Math.min(daysInMonth, daysInclusive(monthStart, asOf)));
  const timePct = daysInMonth ? elapsedDays / daysInMonth : 0;
  const spendVal = spend ?? 0;
  const spendPct = monthlyBudget ? spendVal / monthlyBudget : 0;
  const remaining = monthlyBudget - spendVal;

  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {brandName} · awareness · {from} → {to}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Day of month</div>
          <div className="text-lg font-bold">{loading ? "…" : `Day ${elapsedDays}/${daysInMonth}`}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Spent / budget</div>
          <div className="text-lg font-bold">{loading ? "…" : `${formatIls(spendVal)} / ${formatIls(monthlyBudget)}`}</div>
          <div className="text-[11px] text-[var(--muted)]">תקציב חודשי</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Remaining</div>
          <div className="text-lg font-bold">{loading ? "…" : formatIls(remaining)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Spend vs time</div>
          <div className={`text-lg font-bold ${TONE[paceTone(loading ? null : spendPct, timePct)]}`}>
            {loading ? "…" : `${formatPct(spendPct)} / ${formatPct(timePct)}`}
          </div>
        </div>
      </div>

      {/* Budget utilisation pace — spend fill vs the elapsed-time marker. */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
          <span>ניצול תקציב · {formatPct(spendPct)}</span>
          <span>זמן שחלף · {formatPct(timePct)}</span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--card-border)]/40">
          <div
            className={`h-full rounded-full ${spendPct >= 1 ? "bg-[var(--bad)]" : paceTone(spendPct, timePct) === "good" ? "bg-[var(--good)]" : paceTone(spendPct, timePct) === "warn" ? "bg-[var(--warn)]" : "bg-[var(--muted)]"}`}
            style={{ width: `${Math.min(100, Math.round(spendPct * 100))}%` }}
          />
          <div className="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-[var(--foreground)]" style={{ left: `${Math.min(100, Math.round(timePct * 100))}%` }} />
        </div>
      </div>

      <div className="mt-2 text-[11px] text-[var(--muted)]">
        תקציב חודשי קבוע {formatIls(monthlyBudget)} · הקצב נמדד מול החודש הקלנדרי (הוצאה מתחילת החודש מול הימים שחלפו) · הוצאה חיה מ-Windsor לטווח שנבחר.
      </div>
    </div>
  );
}
