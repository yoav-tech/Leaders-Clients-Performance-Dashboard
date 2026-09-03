"use client";

import { useState } from "react";
import type { BudgetRequest } from "@/lib/budgetRequestStore";

// Lets the client ask for a different daily/monthly budget per city. Saving stores the current ask
// and emails the media managers. Fields start from whatever was last requested, so the client sees
// their standing request rather than an empty form.

interface Row { city: string; daily: string; monthly: string }

const initial = (cities: string[], current: Record<string, BudgetRequest>): Row[] =>
  cities.map((city) => ({
    city,
    daily: current[city]?.daily != null ? String(current[city]!.daily) : "",
    monthly: current[city]?.monthly != null ? String(current[city]!.monthly) : "",
  }));

export default function BudgetRequestPanel({ brandId, cities, current, currentDaily = {} }: { brandId: string; cities: string[]; current: Record<string, BudgetRequest>; currentDaily?: Record<string, number> }) {
  const [rows, setRows] = useState<Row[]>(() => initial(cities, current));
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const set = (i: number, field: "daily" | "monthly", value: string) => {
    // digits only — these are budgets in whole shekels
    const clean = value.replace(/[^\d]/g, "");
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: clean } : r)));
    setState("idle");
  };

  const filled = rows.filter((r) => r.daily !== "" || r.monthly !== "");
  const totalLive = cities.reduce((a, c) => a + (currentDaily[c] ?? 0), 0);

  const submit = async () => {
    if (!filled.length) { setState("error"); setMessage("יש למלא תקציב יומי או חודשי לפחות לעיר אחת."); return; }
    setState("saving");
    try {
      const res = await fetch("/api/budget-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brandId,
          note,
          rows: filled.map((r) => ({ city: r.city, daily: r.daily === "" ? null : Number(r.daily), monthly: r.monthly === "" ? null : Number(r.monthly) })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`);
      setState("sent");
      const n = `${filled.length} ${filled.length === 1 ? "עיר" : "ערים"}`;
      setMessage(json.notified === false
        ? `הבקשה נשמרה (${n}) והיא מול צוות המדיה. שליחת המייל נכשלה — הצוות יראה את הבקשה בדשבורד.`
        : `הבקשה נשלחה לצוות המדיה (${n}).`);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">בקשת שינוי תקציב לפי עיר</div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">
        העמודה “תקציב יומי נוכחי” מציגה את המוגדר כרגע בקמפיינים. מלאו את התקציב המבוקש רק בערים שברצונכם לשנות — לאחר השליחה הבקשה תגיע לצוות המדיה במייל.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">עיר</th>
              <th className="px-2 py-1.5 text-right">תקציב יומי נוכחי</th>
              <th className="px-2 py-1.5 text-right">תקציב יומי מבוקש</th>
              <th className="px-2 py-1.5 text-right">תקציב חודשי מבוקש</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const live = currentDaily[r.city];
              return (
                <tr key={r.city} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 font-medium">{r.city}</td>
                  <td className="px-2 py-1.5 tabular-nums text-[var(--muted)]">{live == null ? "—" : `₪${Math.round(live).toLocaleString("en-US")}`}</td>
                  {(["daily", "monthly"] as const).map((f) => (
                    <td key={f} className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--muted)]">₪</span>
                        <input
                          inputMode="numeric"
                          value={r[f]}
                          onChange={(e) => set(i, f, e.target.value)}
                          placeholder={f === "daily" && live != null ? String(Math.round(live)) : "—"}
                          aria-label={`${f === "daily" ? "תקציב יומי" : "תקציב חודשי"} ${r.city}`}
                          className="w-28 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm tabular-nums outline-none focus:border-blue-600"
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {totalLive > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--card-border)] text-[13px] font-bold tabular-nums">
                <td className="px-2 py-1.5">סה״כ יומי</td>
                <td className="px-2 py-1.5">₪{Math.round(totalLive).toLocaleString("en-US")}</td>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <textarea
        value={note}
        onChange={(e) => { setNote(e.target.value); setState("idle"); }}
        rows={3}
        placeholder="הערה לצוות המדיה (לא חובה)"
        className="mt-3 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm outline-none focus:border-blue-600"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={state === "saving"}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {state === "saving" ? "שולח…" : "שליחת בקשה"}
        </button>
        {message && (
          <span className={`text-sm ${state === "error" ? "text-[var(--bad)]" : "text-[var(--good)]"}`}>{message}</span>
        )}
      </div>
    </div>
  );
}
