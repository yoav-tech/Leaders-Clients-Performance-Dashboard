"use client";

import { useState } from "react";

// Review of the drafted recommendations, one line at a time.
//
// The point of reviewing per line rather than as one blob is that a correction has to attach to the
// rule that wrote it. Approving records that this wording is right for this client; correcting
// replaces it, and the manager's wording — with its figures turned into placeholders — becomes what
// the engine writes for that rule next period. So the review is where the engine is taught.

export interface ReviewLine {
  id: string;
  text: string;
  severity: "critical" | "warn" | "good";
  generated: string;
  source: "engine" | "learned";
  staleFigures?: string[];
  approved?: boolean;
}

const SEV: Record<string, string> = {
  critical: "var(--bad)",
  warn: "var(--warn)",
  good: "var(--good)",
};

export default function InsightReview({
  brandId,
  lines,
  data,
  onChange,
  onApply,
  onClose,
}: {
  brandId: string;
  lines: ReviewLine[];
  /** The figures behind each rule, so a correction can be bound back to them. */
  data: Record<string, Record<string, number>>;
  onChange: (lines: ReviewLine[]) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/client-report/insight-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: brandId, ...body }),
    });
    return { ok: r.ok, json: await r.json().catch(() => ({})) };
  };

  const approve = async (l: ReviewLine) => {
    setBusy(l.id);
    try {
      const { ok, json } = await post({ insightId: l.id, action: "approve", original: l.generated });
      setMsg((m) => ({ ...m, [l.id]: ok ? "אושר ✓" : json.error ?? "שמירה נכשלה" }));
      if (ok) onChange(lines.map((x) => (x.id === l.id ? { ...x, approved: true } : x)));
    } finally { setBusy(null); }
  };

  const saveCorrection = async (l: ReviewLine) => {
    const text = draft.trim();
    if (!text) return;
    setBusy(l.id);
    try {
      const { ok, json } = await post({ insightId: l.id, action: "correct", text, original: l.generated, data: data[l.id] ?? {} });
      if (!ok) { setMsg((m) => ({ ...m, [l.id]: json.error ?? "שמירה נכשלה" })); return; }
      const unresolved: string[] = json.unresolved ?? [];
      setMsg((m) => ({
        ...m,
        [l.id]: unresolved.length
          ? `נשמר ונלמד ✓ · המספרים ${unresolved.join(", ")} אינם מנתוני החוק ולכן יישארו קבועים בניסוח`
          : "נשמר ונלמד ✓ · כל המספרים בניסוח יתעדכנו לבד בתקופה הבאה",
      }));
      onChange(lines.map((x) => (x.id === l.id ? { ...x, text, source: "learned", approved: false, staleFigures: undefined } : x)));
      setEditing(null);
    } finally { setBusy(null); }
  };

  const reset = async (l: ReviewLine) => {
    setBusy(l.id);
    try {
      const { ok } = await post({ insightId: l.id, action: "reset" });
      if (ok) {
        onChange(lines.map((x) => (x.id === l.id ? { ...x, text: x.generated, source: "engine", approved: false, staleFigures: undefined } : x)));
        setMsg((m) => ({ ...m, [l.id]: "חזר לניסוח של המנוע" }));
        setEditing(null);
      }
    } finally { setBusy(null); }
  };

  if (!lines.length) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-[var(--card-border)] p-3 text-sm text-[var(--muted)]">
        המנוע לא מצא ממצאים בני-דיווח לתקופה הזו.
        <button onClick={onClose} className="me-2 text-[var(--muted)] underline">סגור</button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
          בדיקת המלצות · {lines.length} ממצאים — אישור או תיקון. תיקון נלמד ומשמש בפעם הבאה.
        </div>
        <button onClick={onClose} className="text-[11px] text-[var(--muted)] underline">סגור</button>
      </div>

      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[l.severity] ?? "var(--muted)" }} />
              <div className="min-w-0 flex-1">
                {editing === l.id ? (
                  <textarea
                    value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} dir="rtl"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2 text-right text-sm outline-none focus:border-[var(--panel-border)]"
                  />
                ) : (
                  <p className="text-sm leading-relaxed">{l.text}</p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  {l.source === "learned" && <span className="rounded-full bg-[var(--good)]/15 px-2 py-0.5 font-semibold text-[var(--good)]">בניסוח שלך</span>}
                  {l.approved && <span className="rounded-full bg-[var(--good)]/15 px-2 py-0.5 font-semibold text-[var(--good)]">מאושר</span>}
                  {l.staleFigures?.length && (
                    <span className="rounded-full bg-[var(--warn)]/15 px-2 py-0.5 font-semibold text-[var(--warn)]">
                      החוק כבר לא מחשב: {l.staleFigures.join(", ")} — צריך לתקן מחדש
                    </span>
                  )}
                  <span className="text-[var(--muted)]">{l.id}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {editing === l.id ? (
                    <>
                      <button onClick={() => saveCorrection(l)} disabled={busy === l.id || !draft.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">{busy === l.id ? "שומר…" : "שמור ולמד"}</button>
                      <button onClick={() => setEditing(null)} className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-[12px]">בטל</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => approve(l)} disabled={busy === l.id} className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-[12px] font-medium hover:border-[var(--good)] disabled:opacity-50">✓ אישור</button>
                      <button onClick={() => { setEditing(l.id); setDraft(l.text); }} className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-[12px] font-medium hover:border-[var(--warn)]">✎ תיקון</button>
                      {l.source === "learned" && <button onClick={() => reset(l)} disabled={busy === l.id} className="text-[11px] text-[var(--muted)] underline disabled:opacity-50">חזור לניסוח המנוע</button>}
                    </>
                  )}
                  {msg[l.id] && <span className="text-[11px] text-[var(--muted)]">{msg[l.id]}</span>}
                </div>

                {editing === l.id && l.source === "learned" && (
                  <div className="mt-2 rounded border border-[var(--card-border)] bg-[var(--background)]/60 p-2 text-[11px] leading-relaxed text-[var(--muted)]">
                    <span className="font-semibold">הניסוח של המנוע:</span> {l.generated}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--card-border)] pt-3">
        <button onClick={onApply} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">הכנס לתיבת המסקנות</button>
        <span className="text-[11px] text-[var(--muted)]">התיקונים נשמרים מיד. הכנסה לתיבה היא שלב נפרד — הטקסט עדיין ניתן לעריכה לפני שליחה.</span>
      </div>
    </div>
  );
}
