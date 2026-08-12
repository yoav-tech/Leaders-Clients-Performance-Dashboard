"use client";

import { useState } from "react";
import type { DerivedEconomics, UnitEconomics } from "@/lib/unitEconomics";
import { formatIls } from "@/lib/metrics";

// The collection step for an ecommerce client: their margin, fulfilment cost and how much of the
// contribution they want to keep. The ROAS target the plan is built against is derived from these,
// so this is filled in with the client BEFORE the first plan — not typed in by the media team.

interface Field {
  key: keyof UnitEconomics;
  label: string;
  hint: string;
  suffix: "₪" | "%";
  step: string;
}

const FIELDS: Field[] = [
  { key: "aov", label: "סל ממוצע", hint: "ללא מע״מ", suffix: "₪", step: "1" },
  { key: "grossMarginPct", label: "מרווח גולמי", hint: "(הכנסה − עלות המוצר) ÷ הכנסה", suffix: "%", step: "1" },
  { key: "shippingPerOrder", label: "משלוח להזמנה", hint: "מה שהמותג סופג בפועל", suffix: "₪", step: "1" },
  { key: "paymentFeePct", label: "עמלת סליקה", hint: "", suffix: "%", step: "0.1" },
  { key: "otherVariablePerOrder", label: "עלויות משתנות אחרות", hint: "ליקוט, אריזה", suffix: "₪", step: "1" },
  { key: "targetProfitShare", label: "נתח רווח שנשמר", hint: "מהתרומה, לא נכנס לפרסום", suffix: "%", step: "1" },
  { key: "ltvMultiple", label: "מכפיל LTV", hint: "1 = בלי לספור רכישות חוזרות", suffix: "₪", step: "0.1" },
];

const PCT_FIELDS = new Set<keyof UnitEconomics>(["grossMarginPct", "paymentFeePct", "targetProfitShare"]);

type FormState = Record<string, string>;

const toForm = (e: UnitEconomics | null): FormState => ({
  aov: e ? String(e.aov) : "",
  grossMarginPct: e ? String(Math.round(e.grossMarginPct * 1000) / 10) : "",
  shippingPerOrder: e ? String(e.shippingPerOrder) : "",
  paymentFeePct: e ? String(Math.round(e.paymentFeePct * 1000) / 10) : "",
  otherVariablePerOrder: e ? String(e.otherVariablePerOrder) : "",
  targetProfitShare: e ? String(Math.round(e.targetProfitShare * 1000) / 10) : "",
  ltvMultiple: e ? String(e.ltvMultiple) : "1",
  source: e?.source ?? "",
});

export default function EconomicsForm({
  brandId,
  brandName,
  initial,
  initialDerived,
  onSaved,
}: {
  brandId: string;
  brandName: string;
  initial: UnitEconomics | null;
  initialDerived: DerivedEconomics | null;
  onSaved: (e: UnitEconomics, d: DerivedEconomics) => void;
}) {
  const [open, setOpen] = useState(!initial);
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [derived, setDerived] = useState<DerivedEconomics | null>(initialDerived);
  const [collectedAt, setCollectedAt] = useState(initial?.collectedAt ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setErr("");
    const payload: Record<string, unknown> = { brandId, source: form.source };
    for (const f of FIELDS) {
      const raw = Number(form[f.key as string]);
      payload[f.key as string] = PCT_FIELDS.has(f.key) ? raw / 100 : raw;
    }
    try {
      const res = await fetch("/api/economics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { economics?: UnitEconomics; derived?: DerivedEconomics; error?: string };
      if (!res.ok || !j.derived || !j.economics) {
        setErr(j.error ?? "השמירה נכשלה");
        return;
      }
      setDerived(j.derived);
      setCollectedAt(new Date().toISOString());
      onSaved(j.economics, j.derived);
    } catch {
      setErr("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  const complete = FIELDS.every((f) => form[f.key as string] !== "" && Number.isFinite(Number(form[f.key as string])));

  return (
    <div className="mt-3 rounded-lg border border-[var(--card-border)] p-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="text-[12px] font-medium text-[var(--foreground)] underline" onClick={() => setOpen((v) => !v)}>
          יוניט אקונומיקס {open ? "▲" : "▼"}
        </button>
        {derived ? (
          <span className="text-[11px] text-[var(--muted)]">
            ROAS איזון <b className="text-[var(--foreground)]">{derived.breakEvenRoas}</b> · יעד{" "}
            <b className="text-[var(--foreground)]">{derived.targetRoas}</b> · CAC יעד {formatIls(derived.targetCac)}
            {collectedAt ? ` · נאסף ${new Date(collectedAt).toLocaleDateString("he-IL")}` : ""}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--warn)]">לא נאסף — יעד ה-ROAS לא נגזר מרווחיות {brandName}</span>
        )}
      </div>

      {open && (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            יעד ROAS הוא חשבון על הרווחיות של הלקוח, לא דעה של מדיה. הנתונים נאספים מהלקוח לפני בניית הפריסה
            הראשונה ומאומתים מחדש כשמחירים או עלויות זזים.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.key as string} className="block">
                <span className="block text-[11px] text-[var(--muted)]">
                  {f.label} {PCT_FIELDS.has(f.key) ? "(%)" : f.key === "ltvMultiple" ? "" : "(₪)"}
                </span>
                <input
                  value={form[f.key as string] ?? ""}
                  onChange={(e) => set(f.key as string, e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  step={f.step}
                  className="mt-0.5 w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--foreground)] tabular-nums"
                />
                {f.hint && <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{f.hint}</span>}
              </label>
            ))}
            <label className="block sm:col-span-2">
              <span className="block text-[11px] text-[var(--muted)]">מקור הנתונים</span>
              <input
                value={form.source ?? ""}
                onChange={(e) => set("source", e.target.value)}
                placeholder="מי בלקוח מסר את המספרים"
                className="mt-0.5 w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
          </div>

          {err && <p className="mt-2 text-[11px] text-[var(--bad)]">{err}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={busy || !complete}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)] disabled:opacity-50"
            >
              {busy ? "שומר…" : "שמור וגזור יעד"}
            </button>
            {!complete && <span className="text-[11px] text-[var(--muted)]">יש למלא את כל השדות</span>}
          </div>

          {derived && (
            <div className="mt-3 rounded-md bg-[var(--sidebar-active)] p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <div className="text-[11px] text-[var(--muted)]">תרומה להזמנה</div>
                  <div className="text-base font-bold tabular-nums">
                    {formatIls(derived.contributionPerOrder)}
                    <span className="text-[11px] text-[var(--muted)]"> ({Math.round(derived.contributionMarginPct * 100)}%)</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--muted)]">ROAS איזון</div>
                  <div className="text-base font-bold tabular-nums">{derived.breakEvenRoas}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--muted)]">יעד ROAS</div>
                  <div className="text-base font-bold tabular-nums text-[var(--good)]">{derived.targetRoas}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--muted)]">CAC יעד</div>
                  <div className="text-base font-bold tabular-nums">{formatIls(derived.targetCac)}</div>
                </div>
              </div>
              {derived.warnings.map((w, i) => (
                <p key={i} className="mt-2 text-[11px] text-[var(--warn)]">{w}</p>
              ))}
              <p className="mt-2 text-[10px] text-[var(--muted)]">
                תרומה = סל × מרווח − משלוח − סליקה − עלויות אחרות · ROAS איזון = 1 ÷ שיעור התרומה ·
                יעד = איזון ÷ ((1 − נתח הרווח) × מכפיל LTV)
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
