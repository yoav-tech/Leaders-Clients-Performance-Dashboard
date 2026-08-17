"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContentItemDrawer, { type CalItem } from "./ContentItemDrawer";

const PLATFORM: Record<string, { short: string; dot: string }> = {
  instagram: { short: "IG", dot: "#E1306C" },
  facebook: { short: "FB", dot: "#0866FF" },
  linkedin: { short: "IN", dot: "#0A66C2" },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "bg-[var(--muted)]/20 text-[var(--muted)]" },
  pending: { label: "ממתין לאישור", cls: "bg-[var(--warn)]/15 text-[var(--warn)]" },
  approved: { label: "אושר", cls: "bg-[var(--good)]/15 text-[var(--good)]" },
  changes_requested: { label: "בקשת שינוי", cls: "bg-[var(--bad)]/15 text-[var(--bad)]" },
  scheduled: { label: "מתוזמן", cls: "bg-blue-500/15 text-blue-500" },
  published: { label: "פורסם", cls: "bg-purple-500/15 text-purple-400" },
};
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const WEEKDAYS_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ContentCalendar({ brandId }: { brandId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const [items, setItems] = useState<CalItem[]>([]);
  const [monthApproval, setMonthApproval] = useState<{ status: string; note: string } | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<CalItem | { date: string } | null>(null); // existing item or a new-item draft

  const load = useCallback(async () => {
    setLoading(true); setMsg("");
    try {
      const r = await fetch(`/api/content/items?brand=${brandId}&month=${month}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error ?? `שגיאה ${r.status}`); return; }
      setItems(j.items ?? []);
      setMonthApproval(j.monthApproval ?? null);
      setCanEdit(!!j.canEdit);
      setCanApprove(!!j.canApprove);
    } catch (e) {
      setMsg(`שגיאת טעינה: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLoading(false); }
  }, [brandId, month]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) { const k = it.date; (m.get(k) ?? m.set(k, []).get(k)!).push(it); }
    return m;
  }, [items]);

  const [y, mo] = month.split("-").map(Number);
  const lead = new Date(y, mo - 1, 1).getDay();
  const days = new Date(y, mo, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  const setMonthStatus = async (status: "pending" | "approved" | "draft") => {
    setMsg("");
    const r = await fetch(`/api/content/approve-month`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brandId, month, status }) });
    const j = await r.json();
    if (r.ok) { setMsg(status === "pending" ? "נשלח לאישור ✓" : status === "approved" ? "החודש אושר ✓" : "נפתח מחדש"); load(); }
    else setMsg(j.error ?? "פעולה נכשלה");
  };

  const badge = monthApproval && (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS[monthApproval.status === "pending" ? "pending" : monthApproval.status === "approved" ? "approved" : "draft"].cls}`}>
      {monthApproval.status === "approved" ? "החודש אושר" : monthApproval.status === "pending" ? "ממתין לאישור החודש" : "טיוטה"}
    </span>
  );

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header: month nav + monthly sign-off */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm hover:border-[var(--muted)]">‹</button>
          <div className="min-w-[130px] text-center text-sm font-semibold">{MONTHS_HE[mo - 1]} {y}</div>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm hover:border-[var(--muted)]">›</button>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-[var(--muted)]">{msg}</span>}
          {canEdit && monthApproval?.status !== "pending" && monthApproval?.status !== "approved" && (
            <button onClick={() => setMonthStatus("pending")} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium hover:border-[var(--muted)]">שלח חודש לאישור</button>
          )}
          {canEdit && monthApproval?.status === "approved" && (
            <button onClick={() => setMonthStatus("draft")} className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium hover:border-[var(--muted)]">פתח מחדש</button>
          )}
          {canApprove && monthApproval?.status === "pending" && (
            <button onClick={() => setMonthStatus("approved")} className="rounded-md bg-[var(--good)] px-4 py-1.5 text-sm font-semibold text-white">אשר את החודש</button>
          )}
        </div>
      </div>

      {/* Month grid */}
      <div className="panel p-3">
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--muted)]">
          {WEEKDAYS_HE.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} className="min-h-[92px] rounded-lg" />;
            const dayItems = byDay.get(date) ?? [];
            const dayNum = Number(date.slice(-2));
            return (
              <div key={date} className="min-h-[92px] rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--muted)]">{dayNum}</span>
                  {canEdit && <button onClick={() => setOpen({ date })} title="הוסף תוכן" className="text-[13px] leading-none text-[var(--muted)] hover:text-[var(--foreground)]">＋</button>}
                </div>
                <div className="space-y-1">
                  {dayItems.map((it) => {
                    const p = PLATFORM[it.platform] ?? { short: "?", dot: "#888" };
                    return (
                      <button key={it.id} onClick={() => setOpen(it)} className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-right text-[11px] ${STATUS[it.status]?.cls ?? ""}`} title={it.title}>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.dot }} />
                        <span className="shrink-0 font-mono text-[9px] opacity-70">{p.short}</span>
                        <span className="truncate">{it.title || "ללא כותרת"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {loading && <div className="py-3 text-center text-sm text-[var(--muted)]">טוען…</div>}
      </div>

      {open && (
        <ContentItemDrawer
          brandId={brandId}
          item={"id" in open ? open : null}
          defaultDate={"date" in open ? open.date : ""}
          canEdit={canEdit}
          canApprove={canApprove}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); load(); }}
        />
      )}
    </div>
  );
}
