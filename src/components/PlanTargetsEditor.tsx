"use client";

import { useState } from "react";

// Media-plan targets, editable in the dashboard by a media manager.
//
// These lived only in brands.ts, so every revision — a platform stopped mid-flight, a budget moved
// between lines — was a code change and a deploy. That is the wrong shape for numbers the media
// manager owns, and it is why YouTube ran on Chery with no view target at all: nobody was going to
// open a pull request to add one.
//
// A field left empty keeps the signed plan's figure rather than saving a zero, so the signed numbers
// stay visible and an override is always a deliberate act.

export interface EditableLine {
  platform: string;
  title: string;
  signed: { budget: number; thruplay: number; completedViews: number };
  current: { budget: number | null; thruplay: number | null; completedViews: number | null };
}

const cell =
  "w-28 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-left text-sm tabular-nums outline-none focus:border-[var(--panel-border)]";

export default function PlanTargetsEditor({
  brandId,
  lines,
  leadTarget,
  editedBy,
  editedAt,
}: {
  brandId: string;
  lines: EditableLine[];
  leadTarget: { signed: { leads: number; cpa: number } | null; current: { leads: number | null; cpa: number | null } | null };
  editedBy: string | null;
  editedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() =>
    lines.map((l) => ({
      platform: l.platform,
      budget: l.current.budget?.toString() ?? "",
      thruplay: l.current.thruplay?.toString() ?? "",
      completedViews: l.current.completedViews?.toString() ?? "",
    })),
  );
  const [leads, setLeads] = useState(leadTarget.current?.leads?.toString() ?? "");
  const [cpa, setCpa] = useState(leadTarget.current?.cpa?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (i: number, k: "budget" | "thruplay" | "completedViews", v: string) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v.replace(/[^\d.]/g, "") } : x)));

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/media-plan/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandId, lines: rows, leads: { leads, cpa } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? "שמירה נכשלה"); return; }
      setMsg("נשמר ✓ — רענן כדי לראות את הדוח מול היעדים החדשים");
    } catch {
      setMsg("שמירה נכשלה");
    } finally { setSaving(false); }
  };

  const clearRow = (i: number) => setRows((r) => r.map((x, j) => (j === i ? { ...x, budget: "", thruplay: "", completedViews: "" } : x)));

  return (
    <div className="panel p-4 text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">יעדי פריסת המדיה</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">
            {editedAt ? `עודכן לאחרונה ${new Date(editedAt).toLocaleDateString("he-IL")}${editedBy ? ` · ${editedBy}` : ""}` : "לא עודכן מהדשבורד — בתוקף היעדים מהפריסה החתומה"}
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm hover:border-[var(--muted)]">
          {open ? "סגור" : "ערוך יעדים"}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-right">פלטפורמה</th>
                  <th className="px-2 py-1.5 text-left">תקציב</th>
                  <th className="px-2 py-1.5 text-left">יעד צפיות 15ש׳</th>
                  <th className="px-2 py-1.5 text-left">יעד צפיות מלאות</th>
                  <th className="px-2 py-1.5 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.platform} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-2 text-right font-medium">{l.title}</td>
                    {(["budget", "thruplay", "completedViews"] as const).map((k) => (
                      <td key={k} className="px-2 py-2 text-left">
                        <input
                          value={rows[i][k]} onChange={(e) => set(i, k, e.target.value)}
                          placeholder={l.signed[k] ? l.signed[k].toLocaleString("en-US") : "ללא יעד"}
                          className={cell} dir="ltr" inputMode="decimal"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-left">
                      <button onClick={() => clearRow(i)} className="text-[11px] text-[var(--muted)] underline">אפס לפריסה</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--card-border)] pt-3">
            <div>
              <div className="mb-1 text-[11px] text-[var(--muted)]">יעד לידים</div>
              <input value={leads} onChange={(e) => setLeads(e.target.value.replace(/[^\d.]/g, ""))}
                     placeholder={leadTarget.signed ? String(leadTarget.signed.leads) : "ללא"} className={cell} dir="ltr" inputMode="decimal" />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-[var(--muted)]">יעד עלות לליד</div>
              <input value={cpa} onChange={(e) => setCpa(e.target.value.replace(/[^\d.]/g, ""))}
                     placeholder={leadTarget.signed ? String(leadTarget.signed.cpa) : "ללא"} className={cell} dir="ltr" inputMode="decimal" />
            </div>
            <button onClick={save} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "שומר…" : "שמור יעדים"}
            </button>
            {msg && <span className="text-[11px] text-[var(--muted)]">{msg}</span>}
          </div>

          <div className="mt-3 text-[11px] text-[var(--muted)]">
            שדה שנשאר ריק מציג את הערך מהפריסה החתומה (באפור) וממשיך להשתמש בו. היעדים משפיעים על אחוזי העמידה, על עלות היעד ועל המסקנות — לא על ההוצאה בפועל.
          </div>
        </div>
      )}
    </div>
  );
}
