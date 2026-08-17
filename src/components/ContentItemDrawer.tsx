"use client";

import { useState } from "react";

export interface CalItem {
  id: string;
  brandId: string;
  date: string;
  platform: "instagram" | "facebook" | "linkedin";
  title: string;
  body: string;
  assetPath: string | null;
  assetKind: "image" | "video" | "link";
  assetUrl: string | null;
  briefId: string | null;
  status: string;
  clientFeedback: string;
}

const PLATFORMS: { id: CalItem["platform"]; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
];
const STATUS_LABEL: Record<string, string> = { draft: "טיוטה", pending: "ממתין לאישור", approved: "אושר", changes_requested: "בקשת שינוי", scheduled: "מתוזמן", published: "פורסם" };

export default function ContentItemDrawer({
  brandId,
  item,
  defaultDate,
  canEdit,
  canApprove,
  onClose,
  onSaved,
}: {
  brandId: string;
  item: CalItem | null;
  defaultDate: string;
  canEdit: boolean;
  canApprove: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(item?.date ?? defaultDate);
  const [platform, setPlatform] = useState<CalItem["platform"]>(item?.platform ?? "instagram");
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [assetKind, setAssetKind] = useState<CalItem["assetKind"]>(item?.assetKind ?? "image");
  const [assetPath, setAssetPath] = useState<string | null>(item?.assetPath ?? null);
  const [preview, setPreview] = useState<string | null>(item?.assetUrl ?? null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const readOnlyFields = !canEdit; // the CEO sees fields read-only

  const upload = async (file: File) => {
    setBusy(true); setMsg("");
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("brand", brandId);
      const r = await fetch("/api/content/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (r.ok) { setAssetPath(j.path); setAssetKind(j.kind); setPreview(URL.createObjectURL(file)); setMsg("הקובץ הועלה ✓"); }
      else setMsg(j.error ?? "העלאה נכשלה");
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/content/item", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item?.id, brand: brandId, date, platform, title, body, assetKind, assetPath }),
      });
      const j = await r.json();
      if (r.ok) onSaved(); else setMsg(j.error ?? "שמירה נכשלה");
    } finally { setBusy(false); }
  };

  const patchStatus = async (status: string, fb?: string) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/content/item", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item?.id, status, feedback: fb }),
      });
      const j = await r.json();
      if (r.ok) onSaved(); else setMsg(j.error ?? "פעולה נכשלה");
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/content/item?id=${item.id}`, { method: "DELETE" });
      if (r.ok) onSaved(); else setMsg("מחיקה נכשלה");
    } finally { setBusy(false); }
  };

  const inputCls = "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--panel-border)] disabled:opacity-70";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onMouseDown={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-[var(--panel)] p-5 shadow-2xl" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-base font-bold">{item ? "פריט תוכן" : "תוכן חדש"}</div>
          <div className="flex items-center gap-2">
            {item && <span className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">{STATUS_LABEL[item.status] ?? item.status}</span>}
            <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--muted)]">תאריך</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnlyFields} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--muted)]">פלטפורמה</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as CalItem["platform"])} disabled={readOnlyFields} className={inputCls}>
                {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--muted)]">כותרת</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnlyFields} placeholder="כותרת הפוסט" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--muted)]">תוכן / קופי</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={readOnlyFields} rows={4} placeholder="טקסט הפוסט…" className={inputCls} />
          </label>

          {/* Asset */}
          <div>
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--muted)]">נכס</span>
            {canEdit && (
              <div className="mb-2 flex gap-1">
                {(["image", "video", "link"] as const).map((k) => (
                  <button key={k} onClick={() => setAssetKind(k)} className={`rounded-md px-2.5 py-1 text-xs ${assetKind === k ? "bg-blue-600 text-white" : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)]"}`}>
                    {k === "image" ? "תמונה" : k === "video" ? "וידאו" : "לינק"}
                  </button>
                ))}
              </div>
            )}
            {canEdit && assetKind !== "link" && (
              <input type="file" accept={assetKind === "video" ? "video/*" : "image/*"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="block w-full text-xs text-[var(--muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--card)] file:px-3 file:py-1.5 file:text-[var(--foreground)]" />
            )}
            {canEdit && assetKind === "link" && (
              <input value={assetPath ?? ""} onChange={(e) => setAssetPath(e.target.value)} placeholder="https://canva.com/… או Drive" className={inputCls} />
            )}
            {preview && assetKind === "image" && <img src={preview} alt="" className="mt-2 max-h-48 rounded-lg border border-[var(--card-border)]" />}
            {preview && assetKind === "video" && <video src={preview} controls className="mt-2 max-h-48 w-full rounded-lg border border-[var(--card-border)]" />}
            {assetKind === "link" && assetPath && <a href={assetPath} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-blue-500 hover:underline" dir="ltr">{assetPath}</a>}
          </div>

          {/* Client feedback surfaced to the manager */}
          {item?.clientFeedback && (
            <div className="rounded-lg border border-[var(--bad)]/30 bg-[var(--bad)]/10 p-2.5 text-sm">
              <div className="mb-0.5 text-[11px] font-semibold text-[var(--bad)]">הערת הלקוח</div>
              {item.clientFeedback}
            </div>
          )}

          {msg && <div className="text-[11px] text-[var(--muted)]">{msg}</div>}

          {/* Manager actions */}
          {canEdit && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--card-border)] pt-3">
              <button onClick={save} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "שומר…" : "שמור"}</button>
              {item && item.status !== "pending" && item.status !== "approved" && (
                <button onClick={() => patchStatus("pending")} disabled={busy} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm font-medium hover:border-[var(--muted)]">שלח לאישור</button>
              )}
              {item && item.status === "approved" && (
                <>
                  <button onClick={() => patchStatus("scheduled")} disabled={busy} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm hover:border-[var(--muted)]">סמן מתוזמן</button>
                  <button onClick={() => patchStatus("published")} disabled={busy} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm hover:border-[var(--muted)]">סמן פורסם</button>
                </>
              )}
              {item && <button onClick={del} disabled={busy} className="ml-auto rounded-md px-3 py-2 text-sm text-[var(--bad)] hover:bg-[var(--bad)]/10">מחק</button>}
            </div>
          )}

          {/* CEO approval actions */}
          {canApprove && item && item.status !== "approved" && (
            <div className="space-y-2 border-t border-[var(--card-border)] pt-3">
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="הערה לבקשת שינוי (רשות)…" className={inputCls} />
              <div className="flex gap-2">
                <button onClick={() => patchStatus("approved")} disabled={busy} className="rounded-md bg-[var(--good)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">אשר</button>
                <button onClick={() => patchStatus("changes_requested", feedback)} disabled={busy} className="rounded-md border border-[var(--bad)]/40 px-4 py-2 text-sm font-medium text-[var(--bad)] hover:bg-[var(--bad)]/10">בקש שינוי</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
