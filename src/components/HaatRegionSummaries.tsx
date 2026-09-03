import type { RegionCostReport } from "@/lib/regionCost";
import { cityLabel, type ManualRegionSummary } from "@/lib/haatRegions";
import { formatIls, formatNumber } from "@/lib/metrics";

// Two summaries that sit at the top of the Haat report, right under the overview:
//   1. WeekRegionPanel  — the trailing 7 days by city, live from the ads data.
//   2. ManualMonthPanel — the client's own monthly summary (August), entered by hand.
// Same columns in both so the week reads directly against the month it came out of.

const cprFmt = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(2)}`);
const fmtD = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);

function Bubble({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">{value}</div>
    </div>
  );
}

const HEAD = (
  <thead>
    <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
      <th className="px-2 py-1.5 text-right">עיר</th>
      <th className="px-2 py-1.5 text-left">הוצאה</th>
      <th className="px-2 py-1.5 text-left">הרשמות</th>
      <th className="px-2 py-1.5 text-left">עלות להרשמה</th>
    </tr>
  </thead>
);

export function WeekRegionPanel({ report }: { report: RegionCostReport }) {
  const rows = report.rows
    .filter((r) => r.week.spend > 0 || r.week.regs > 0)
    .map((r) => ({ city: cityLabel(r.city), spend: r.week.spend, regs: r.week.regs, cpr: r.week.cpr }))
    .sort((a, b) => b.regs - a.regs);
  const t = report.totalWeek;

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">סיכום השבוע האחרון · הרשמות לפי עיר</div>
        <div className="text-[11px] text-[var(--muted)]" dir="ltr">{fmtD(report.weekFrom)}–{fmtD(report.weekTo)}</div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Bubble label="הוצאה" value={formatIls(t.spend)} />
        <Bubble label="הרשמות" value={formatNumber(t.regs)} />
        <Bubble label="עלות להרשמה" value={cprFmt(t.cpr)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          {HEAD}
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.city} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 text-right font-medium">{r.city}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(r.spend)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(r.regs)}</td>
                <td className="px-2 py-1.5 text-left font-semibold">{cprFmt(r.cpr)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-2 py-3 text-center text-[var(--muted)]">אין נתונים בשבוע האחרון.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--card-border)] font-bold tabular-nums">
                <td className="px-2 py-1.5 text-right">סה״כ</td>
                <td className="px-2 py-1.5 text-left">{formatIls(t.spend)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(t.regs)}</td>
                <td className="px-2 py-1.5 text-left">{cprFmt(t.cpr)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">7 ימים אחרונים (עד אתמול), הרשמות כפי שמיוחסות במטא.</div>
    </div>
  );
}

export function ManualMonthPanel({ summary }: { summary: ManualRegionSummary }) {
  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">סיכום חודשי · הרשמות ועלות להרשמה לפי עיר</div>
        <div className="text-[11px] text-[var(--muted)]">{summary.label}</div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Bubble label="הוצאה" value={formatIls(summary.total.spend)} />
        <Bubble label="הרשמות" value={formatNumber(summary.total.regs)} />
        <Bubble label="עלות להרשמה" value={`₪${summary.total.cpr}`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          {HEAD}
          <tbody className="tabular-nums">
            {summary.rows.map((r) => (
              <tr key={r.city} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 text-right font-medium">{r.city}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(r.spend)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(r.regs)}</td>
                <td className="px-2 py-1.5 text-left font-semibold">₪{r.cpr}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--card-border)] font-bold tabular-nums">
              <td className="px-2 py-1.5 text-right">{summary.total.city}</td>
              <td className="px-2 py-1.5 text-left">{formatIls(summary.total.spend)}</td>
              <td className="px-2 py-1.5 text-left">{formatNumber(summary.total.regs)}</td>
              <td className="px-2 py-1.5 text-left">₪{summary.total.cpr}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">סיכום ידני — ההרשמות נספרות במערכת של Haat, ולכן גבוהות מההרשמות המיוחסות במטא.</div>
    </div>
  );
}
