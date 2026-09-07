import type { ManualRegionSummary } from "@/lib/haatRegions";
import { formatIls, formatNumber } from "@/lib/metrics";

// The client's own registration summaries by city, entered by hand — a weekly one and a monthly
// one, stacked under the overview at the top of the Haat report. These are NOT computed from the
// ad platforms: the registrations are counted in Haat's own system, so they run well above what
// Meta attributes. Update the numbers in lib/haatRegions.ts when a new summary arrives.

// Rows pulled from the Google Sheet carry a comparison against the previous reading; the
// hand-entered monthly summary doesn't. The extra columns appear only when the data has them.
interface ComparedRow { prevCpr?: number | null; direction?: "down" | "up" | null }

export default function ManualRegionPanel({ summary, title, capturedAt }: { summary: ManualRegionSummary; title: string; capturedAt?: string }) {
  const money = (v: number) => formatIls(Math.round(v));
  const compared = summary.rows.some((r) => (r as ManualRegionSummary["rows"][number] & ComparedRow).prevCpr != null);
  const cmp = (r: ManualRegionSummary["rows"][number]) => r as ManualRegionSummary["rows"][number] & ComparedRow;
  const stamp = capturedAt
    ? new Date(capturedAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" })
    : null;

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
        <div className="text-[11px] text-[var(--muted)]">{summary.label}{stamp ? ` · עודכן ${stamp}` : ""}</div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: "הוצאה", value: money(summary.total.spend) },
          { label: "הרשמות", value: formatNumber(summary.total.regs) },
          { label: "עלות להרשמה", value: `₪${summary.total.cpr}` },
        ].map((b) => (
          <div key={b.label} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{b.label}</div>
            <div className="mt-0.5 text-2xl font-bold">{b.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">עיר</th>
              <th className="px-2 py-1.5 text-left">הוצאה</th>
              <th className="px-2 py-1.5 text-left">הרשמות</th>
              <th className="px-2 py-1.5 text-left">עלות להרשמה</th>
              {compared && <th className="px-2 py-1.5 text-left">בדיקה קודמת</th>}
              {compared && <th className="px-2 py-1.5 text-left">שינוי</th>}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {summary.rows.map((r) => {
              const c = cmp(r);
              return (
                <tr key={r.city} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 text-right font-medium">{r.city}</td>
                  <td className="px-2 py-1.5 text-left">{money(r.spend)}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(r.regs)}</td>
                  <td className="px-2 py-1.5 text-left font-semibold">₪{r.cpr}</td>
                  {compared && <td className="px-2 py-1.5 text-left text-[var(--muted)]">{c.prevCpr == null ? "—" : `₪${c.prevCpr}`}</td>}
                  {compared && (
                    <td className={`px-2 py-1.5 text-left font-medium ${c.direction === "up" ? "text-[var(--bad)]" : c.direction === "down" ? "text-[var(--good)]" : "text-[var(--muted)]"}`}>
                      {c.direction === "up" ? "↑ התייקרות" : c.direction === "down" ? "↓ הוזלה" : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--card-border)] font-bold tabular-nums">
              <td className="px-2 py-1.5 text-right">{summary.total.city}</td>
              <td className="px-2 py-1.5 text-left">{money(summary.total.spend)}</td>
              <td className="px-2 py-1.5 text-left">{formatNumber(summary.total.regs)}</td>
              <td className="px-2 py-1.5 text-left">₪{summary.total.cpr}</td>
              {compared && <td className="px-2 py-1.5 text-left text-[var(--muted)]">{cmp(summary.total).prevCpr == null ? "—" : `₪${cmp(summary.total).prevCpr}`}</td>}
              {compared && <td className="px-2 py-1.5" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
