"use client";

import { useState } from "react";

// Brand-level goals, editable by a media manager.
//
// These lived only in brands.ts, so changing a client's target meant a commit and a deploy. That
// cost real accuracy: Protein Max and Style ran marked red for weeks against a cost-per-view figure
// derived from a benchmark nobody had agreed to, because fixing it required a code change.
//
// Only the goals that mean something for this report type are shown, and a field left empty keeps
// the configured value — visible as the placeholder — so an override is always deliberate.

export interface TargetField { key: string; label: string; configured: number | null; current: number | null; hint?: string }

export default function BrandTargetsEditor({
  brandId, fields, editedBy, editedAt,
}: {
  brandId: string;
  fields: TargetField[];
  editedBy: string | null;
  editedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.current?.toString() ?? ""])));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/brand-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandId, ...vals }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? "נשמר ✓ — רענן כדי לראות את הדוח מול היעדים החדשים" : (j.error ?? "שמירה נכשלה"));
    } catch { setMsg("שמירה נכשלה"); }
    finally { setSaving(false); }
  };

  if (!fields.length) return null;

  return (
    <div className="panel p-4 text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">יעדי הלקוח</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">
            {editedAt ? `עודכן ${new Date(editedAt).toLocaleDateString("he-IL")}${editedBy ? ` · ${editedBy}` : ""}` : "לא הוגדרו מהדשבורד — בתוקף הערכים מההגדרות"}
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm hover:border-[var(--muted)]">
          {open ? "סגור" : "ערוך יעדים"}
        </button>
      </div>

      {open && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            {fields.map((f) => (
              <div key={f.key}>
                <div className="mb-1 text-[11px] text-[var(--muted)]">{f.label}</div>
                <input
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))}
                  placeholder={f.configured != null ? f.configured.toLocaleString("en-US") : "לא הוגדר"}
                  className="w-32 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-left text-sm tabular-nums outline-none focus:border-[var(--panel-border)]"
                  dir="ltr" inputMode="decimal"
                />
                {f.hint && <div className="mt-1 text-[10px] text-[var(--muted)]">{f.hint}</div>}
              </div>
            ))}
            <button onClick={save} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "שומר…" : "שמור"}
            </button>
            {msg && <span className="text-[11px] text-[var(--muted)]">{msg}</span>}
          </div>
          <div className="mt-3 text-[11px] text-[var(--muted)]">
            שדה ריק ממשיך להשתמש בערך מההגדרות (מוצג באפור). היעדים קובעים את צביעת המדדים, את אחוזי העמידה ואת המסקנות — ולא את הנתונים עצמם. תקציב 0 מסתיר את פאנל קצב התקציב.
          </div>
        </>
      )}
    </div>
  );
}
