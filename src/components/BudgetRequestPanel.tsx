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

export default function BudgetRequestPanel({ brandId, cities, current }: { brandId: string; cities: string[]; current: Record<string, BudgetRequest> }) {
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
      setMessage(`הבקשה נשלחה לצוות המדיה (${filled.length} ${filled.length === 1 ? "עיר" : "ערים"}).`);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">בקשת שינוי תקציב לפי עיר</div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">
        מלאו את התקציב היומי או החודשי המבוקש לכל עיר. לאחר השליחה הבקשה תגיע לצוות המדיה במייל.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">עיר</th>
              <th className="px-2 py-1.5 text-right">תקציב יומי מבוקש</th>
              <th className="px-2 py-1.5 text-right">תקציב חודשי מבוקש</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.city} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 font-medium">{r.city}</td>
                {(["daily", "monthly"] as const).map((f) => (
                  <td key={f} className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--muted)]">₪</span>
                      <input
                        inputMode="numeric"
                        value={r[f]}
                        onChange={(e) => set(i, f, e.target.value)}
                        placeholder="—"
                        aria-label={`${f === "daily" ? "תקציב יומי" : "תקציב חודשי"} ${r.city}`}
                        className="w-28 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm tabular-nums outline-none focus:border-blue-600"
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
