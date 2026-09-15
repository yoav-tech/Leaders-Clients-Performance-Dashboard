"use client";

import { useState } from "react";

// The verbal-summary section ("מלל") of the client report. Always visible, and always states the
// period it covers so it's unambiguous. Everyone sees the auto summary; the manager's written
// conclusions show read-only to the client. Media managers (admin/manager) get the editor + send.
export default function ReportConclusions({
  brandId,
  from,
  to,
  periodLabel,
  summary,
  initialNote,
  initialStatus,
  initialSentAt,
  canEdit,
  canDraft = false,
}: {
  brandId: string;
  from: string;
  to: string;
  periodLabel: string;
  summary: string;
  initialNote: string;
  initialStatus: "draft" | "sent";
  initialSentAt: string | null;
  canEdit: boolean;
  /** Show the "draft from the recommendation engine" button — e-commerce brands only. */
  canDraft?: boolean;
}) {
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<"draft" | "sent">(initialStatus);
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [msg, setMsg] = useState("");


  // Draft from the recommendation engine — the same rules the internal review runs, restated in a
  // client-facing voice. It's a starting point: it lands in the editor, never straight in an email,
  // and it never silently replaces something the manager already wrote.
  // Draft from the recommendation engine — the same rules the internal review runs, restated in a
  // client-facing voice, plus what actually changed in the account this period. It's a starting
  // point: it lands in the editor, never straight in an email.
  //
  // Nothing here asks the manager to rate it. The engine learns from the send instead: whatever
  // they edit this into is diffed against this draft when the report goes out, and that difference
  // is the correction. See insightLearning.ts.
  const draft = async () => {
    if (note.trim() && !confirm("יש כבר מסקנות בתיבה. להחליף אותן בטיוטה חדשה?")) return;
    setDrafting(true); setMsg("");
    try {
      const r = await fetch(`/api/client-report/conclusions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandId, from, to }),
      });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error ?? "יצירת טיוטה נכשלה"); return; }
      setNote(j.text);
      const learned = (j.lines ?? []).filter((l: { source?: string }) => l.source === "learned").length;
      const held = (j.withheld ?? []).length;
      const n = (j.lines ?? []).length;
      // A draft that wasn't recorded still gets sent — it just can't teach the engine, and the
      // manager should know that rather than assume the edit was picked up.
      const learnNote = n === 0 ? "" : j.recorded ? " · העריכות שלך ייקלטו במנוע בשליחה" : " · לא נרשמה לצורך למידה";
      setMsg(`טיוטה נוצרה מ-${n} ממצאים${learned ? ` · ${learned} בניסוח שנלמד מדוחות קודמים` : ""}${held ? ` · ${held} ממצאים פנימיים לא נכללו` : ""}${learnNote} — לעבור ולערוך לפני שליחה`);
    } catch {
      setMsg("יצירת טיוטה נכשלה");
    } finally { setDrafting(false); }
  };

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const r = await fetch(`/api/client-report/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandId, period: "custom", from, to, note }),
      });
      setMsg(r.ok ? "ההערה נשמרה ✓" : "שמירה נכשלה");
    } finally { setSaving(false); }
  };
  const send = async () => {
    setSending(true); setMsg("");
    try {
      await save();
      const r = await fetch(`/api/client-report/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandId, period: "custom", from, to }),
      });
      const j = await r.json();
      if (r.ok) { setStatus("sent"); setSentAt(new Date().toISOString()); setMsg(`נשלח ✓ (${(j.sentTo ?? []).join(", ")})`); }
      else setMsg(j.error ?? "שליחה נכשלה");
    } finally { setSending(false); }
  };

  const badge = status === "sent"
    ? <span className="rounded-full bg-[var(--good)]/15 px-2.5 py-1 text-[11px] font-semibold text-[var(--good)]">נשלח ללקוח{sentAt ? ` · ${new Date(sentAt).toLocaleDateString("he-IL")}` : ""}</span>
    : <span className="rounded-full bg-[var(--warn)]/15 px-2.5 py-1 text-[11px] font-semibold text-[var(--warn)]">טיוטה · ממתין להערת מנהל</span>;

  return (
    <div className="panel p-4 text-right" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">סיכום מילולי</div>
          <div className="mt-0.5 text-sm font-semibold">תקופה: {periodLabel}</div>
        </div>
        {canEdit && badge}
      </div>

      {/* Auto summary — shown to everyone; the period is restated inside it. Only the e-commerce
          report generates one, so the block is skipped rather than shown empty. */}
      {summary.trim() && (
        <>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">תקציר אוטומטי</div>
          <p className="rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/40 p-3 text-sm leading-relaxed">{summary}</p>
        </>
      )}

      {/* Manager conclusions. */}
      <div className="mt-4 mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {canEdit ? "מסקנות מנהל (מה שהלקוח יראה)" : "מסקנות והמלצות"}
      </div>
      {canEdit ? (
        <>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={4} dir="rtl"
            placeholder="הוסף מסקנות והמלצות ללקוח (יעדים, מה עבד, המלצות להמשך)…"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-right text-sm text-[var(--foreground)] outline-none focus:border-[var(--panel-border)]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canDraft && (
              <button onClick={draft} disabled={drafting} className="rounded-md border border-[var(--panel-border)] bg-[var(--panel-border)]/20 px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)] disabled:opacity-50" title="טיוטת מסקנות ללקוח על בסיס מנוע ההמלצות">
                {drafting ? "מייצר…" : "✨ צור מסקנות ללקוח"}
              </button>
            )}
            <button onClick={save} disabled={saving} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)] disabled:opacity-50">{saving ? "שומר…" : "שמור"}</button>
            <button onClick={send} disabled={sending || !note.trim()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" title={!note.trim() ? "הוסף מסקנות לפני שליחה" : "שלח את הסיכום ללקוח"}>{sending ? "שולח…" : "שלח סיכום ללקוח"}</button>
            {msg && <span className="text-[11px] text-[var(--muted)]">{msg}</span>}
          </div>
          <div className="mt-2 text-[11px] text-[var(--muted)]">{canDraft ? "הטיוטה נבנית ממנוע ההמלצות על נתוני התקופה — לא ממודל שפה. " : ""}רק מנהל מדיה עורך ושולח. הסיכום לא נשלח אוטומטית — נדרשות מסקנות ושליחה ידנית.</div>
        </>
      ) : note.trim() ? (
        <p className="whitespace-pre-wrap rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3 text-sm leading-relaxed">{note}</p>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--card-border)] p-3 text-sm text-[var(--muted)]">מסקנות המנהל יתווספו כאן בקרוב.</div>
      )}
    </div>
  );
}
