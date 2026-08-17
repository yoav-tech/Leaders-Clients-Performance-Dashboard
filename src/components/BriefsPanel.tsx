"use client";

import { useCallback, useEffect, useState } from "react";

interface Brief {
  id: string;
  title: string;
  objective: string;
  audience: string;
  keyMessage: string;
  channels: string[];
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  status: "draft" | "active" | "done";
  notes: string;
}

const CHANNELS = ["Instagram", "Facebook", "LinkedIn", "Meta Ads", "Google Ads", "TikTok"];
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "bg-[var(--muted)]/20 text-[var(--muted)]" },
  active: { label: "פעיל", cls: "bg-[var(--good)]/15 text-[var(--good)]" },
  done: { label: "הושלם", cls: "bg-blue-500/15 text-blue-500" },
};
const empty: Brief = { id: "", title: "", objective: "", audience: "", keyMessage: "", channels: [], budget: null, startDate: null, endDate: null, status: "draft", notes: "" };

export default function BriefsPanel({ brandId }: { brandId: string }) {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/briefs?brand=${brandId}`, { cache: "no-store" });
      const j = await r.json();
      setBriefs(j.briefs ?? []);
      setCanEdit(!!j.canEdit);
    } finally { setLoading(false); }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/briefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...edit, brand: brandId }) });
      const j = await r.json();
      if (r.ok) { setEdit(null); load(); } else setMsg(j.error ?? "שמירה נכשלה");
    } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    setBusy(true);
    try { const r = await fetch(`/api/briefs?brand=${brandId}&id=${id}`, { method: "DELETE" }); if (r.ok) { setEdit(null); load(); } }
    finally { setBusy(false); }
  };
  const toggleChannel = (c: string) => setEdit((e) => e && ({ ...e, channels: e.channels.includes(c) ? e.channels.filter((x) => x !== c) : [...e.channels, c] }));

  const inputCls = "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--panel-border)]";

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">בריפים</div>
        {canEdit && <button onClick={() => setEdit({ ...empty })} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">＋ בריף חדש</button>}
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-[var(--muted)]">טוען…</div>
      ) : briefs.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-[var(--muted)]">אין בריפים עדיין{canEdit ? " — צור את הראשון." : "."}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {briefs.map((b) => (
            <div key={b.id} className="panel p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-semibold">{b.title || "ללא כותרת"}</div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
              </div>
              {b.objective && <p className="text-sm text-[var(--muted)]">{b.objective}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.channels.map((c) => <span key={c} className="rounded border border-[var(--card-border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{c}</span>)}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                {b.budget != null && <span>תקציב ₪{Math.round(b.budget).toLocaleString("en-US")}</span>}
                {(b.startDate || b.endDate) && <span dir="ltr">{b.startDate ?? "…"} → {b.endDate ?? "…"}</span>}
              </div>
              {canEdit && <button onClick={() => setEdit(b)} className="mt-3 text-xs font-medium text-blue-500 hover:underline">ערוך</button>}
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onMouseDown={() => setEdit(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-[var(--card)] p-5 shadow-2xl" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-base font-bold">{edit.id ? "עריכת בריף" : "בריף חדש"}</div>
              <button onClick={() => setEdit(null)} className="text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
            <div className="space-y-3">
              <Field label="כותרת"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={inputCls} /></Field>
              <Field label="מטרה"><textarea value={edit.objective} onChange={(e) => setEdit({ ...edit, objective: e.target.value })} rows={2} className={inputCls} /></Field>
              <Field label="קהל יעד"><input value={edit.audience} onChange={(e) => setEdit({ ...edit, audience: e.target.value })} className={inputCls} /></Field>
              <Field label="מסר מרכזי"><textarea value={edit.keyMessage} onChange={(e) => setEdit({ ...edit, keyMessage: e.target.value })} rows={2} className={inputCls} /></Field>
              <Field label="ערוצים">
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map((c) => (
                    <button key={c} onClick={() => toggleChannel(c)} className={`rounded-md px-2.5 py-1 text-xs ${edit.channels.includes(c) ? "bg-blue-600 text-white" : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)]"}`}>{c}</button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="תקציב (₪)"><input type="number" value={edit.budget ?? ""} onChange={(e) => setEdit({ ...edit, budget: e.target.value === "" ? null : Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="סטטוס">
                  <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Brief["status"] })} className={inputCls}>
                    <option value="draft">טיוטה</option><option value="active">פעיל</option><option value="done">הושלם</option>
                  </select>
                </Field>
                <Field label="התחלה"><input type="date" value={edit.startDate ?? ""} onChange={(e) => setEdit({ ...edit, startDate: e.target.value || null })} className={inputCls} /></Field>
                <Field label="סיום"><input type="date" value={edit.endDate ?? ""} onChange={(e) => setEdit({ ...edit, endDate: e.target.value || null })} className={inputCls} /></Field>
              </div>
              <Field label="הערות"><textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={3} className={inputCls} /></Field>
              {msg && <div className="text-[11px] text-[var(--muted)]">{msg}</div>}
              <div className="flex gap-2 border-t border-[var(--card-border)] pt-3">
                <button onClick={save} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "שומר…" : "שמור"}</button>
                {edit.id && <button onClick={() => del(edit.id)} disabled={busy} className="ml-auto rounded-md px-3 py-2 text-sm text-[var(--bad)] hover:bg-[var(--bad)]/10">מחק</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
