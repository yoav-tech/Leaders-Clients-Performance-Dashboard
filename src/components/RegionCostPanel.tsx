import type { RegionCostReport, UacPoint } from "@/lib/regionCost";
import { formatIls, formatNumber } from "@/lib/metrics";
import { cityLabel } from "@/lib/haatRegions";

// Haat · cost per registration by region — last 3 days vs start of month + month average, outliers
// on top so a region whose cost jumped (e.g. ₪3.75 → ₪40) is impossible to miss. A UAC trend line
// (month-to-date) sits under the table.

const cpr = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(2)}`);
const fmtD = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);

function tone(delta: number | null): { cls: string; row: string } {
  if (delta == null) return { cls: "text-[var(--muted)]", row: "" };
  if (delta >= 50) return { cls: "text-[var(--bad)] font-bold", row: "bg-[var(--bad)]/10 border-r-2 border-[var(--bad)]" };
  if (delta >= 20) return { cls: "text-[var(--bad)]", row: "" };
  if (delta >= 8) return { cls: "text-[var(--warn)]", row: "" };
  if (delta <= -15) return { cls: "text-[var(--good)]", row: "" };
  return { cls: "text-[var(--muted)]", row: "" };
}
const arrow = (d: number | null) => (d == null ? "" : d > 1 ? "↑" : d < -1 ? "↓" : "→");
const deltaText = (d: number | null) => (d == null ? "—" : `${arrow(d)} ${d > 0 ? "+" : ""}${Math.round(d)}%`);

function Bubble({ label, value, delta, tone: t }: { label: string; value: string; delta?: number | null; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${t ?? ""}`}>{value}</span>
        {delta !== undefined && <span className={`text-xs font-medium ${tone(delta ?? null).cls}`}>{deltaText(delta ?? null)}</span>}
      </div>
    </div>
  );
}

// UAC month-to-date trend — a violet line under the table (SVG, CSP-safe, no external lib).
function UacTrend({ points }: { points: UacPoint[] }) {
  const defined = points.filter((p): p is { date: string; cpr: number } => p.cpr != null);
  if (defined.length < 2) return null;
  const W = 720, H = 120, PAD = 6;
  const vals = defined.map((p) => p.cpr);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (defined.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const line = defined.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cpr).toFixed(1)}`).join(" ");
  const area = `${line} L${x(defined.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span className="uppercase tracking-wide">מגמת עלות הרשמה (UAC) · מתחילת החודש</span>
        <span dir="ltr">גבוה ₪{max.toFixed(1)} · נמוך ₪{min.toFixed(1)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none">
        <path d={area} fill="rgba(139,92,246,0.12)" />
        <path d={line} fill="none" stroke="#8b5cf6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--muted)]" dir="ltr">
        <span>{fmtD(defined[0].date)}</span>
        <span>{fmtD(defined[defined.length - 1].date)}</span>
      </div>
    </div>
  );
}

export default function RegionCostPanel({ report }: { report: RegionCostReport }) {
  const active = report.rows.filter((r) => r.recent.regs > 0 || r.base.regs > 0);
  const spikes = active.filter((r) => (r.deltaPct ?? 0) >= 50).length;

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">עלות הרשמה לפי אזור · מגמה</div>
        <div className="text-[11px] text-[var(--muted)]" dir="ltr">
          3 ימים ({fmtD(report.recentFrom)}–{fmtD(report.recentTo)}) · תחילת החודש ({fmtD(report.baseFrom)}–{fmtD(report.baseTo)})
        </div>
      </div>

      {/* UAC bubbles */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Bubble label="עלות הרשמה · UAC (3 ימים)" value={cpr(report.totalRecent.cpr)} delta={report.deltaPct} />
        <Bubble label="ממוצע החודש" value={cpr(report.totalMonth.cpr)} />
        <Bubble label="תחילת החודש" value={cpr(report.totalBase.cpr)} />
        <Bubble label="הרשמות (3 ימים)" value={formatNumber(report.totalRecent.regs)} />
        <Bubble label="אזורים בזינוק (≥50%)" value={String(spikes)} tone={spikes ? "text-[var(--bad)]" : ""} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">אזור</th>
              <th className="px-2 py-1.5 text-left">עלות הרשמה · 3 ימים</th>
              <th className="px-2 py-1.5 text-left">תחילת החודש</th>
              <th className="px-2 py-1.5 text-left">שינוי</th>
              <th className="px-2 py-1.5 text-left">הרשמות (3 ימים)</th>
              <th className="px-2 py-1.5 text-left">הוצאה (3 ימים)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {active.map((r) => {
              const tn = tone(r.deltaPct);
              return (
                <tr key={r.city} className={`border-t border-[var(--card-border)] ${tn.row}`}>
                  <td className="px-2 py-1.5 text-right font-medium">{cityLabel(r.city)}</td>
                  <td className={`px-2 py-1.5 text-left font-semibold ${tn.cls}`}>{cpr(r.recent.cpr)}</td>
                  <td className="px-2 py-1.5 text-left text-[var(--muted)]">{cpr(r.base.cpr)}</td>
                  <td className={`px-2 py-1.5 text-left font-medium ${tn.cls}`}>{deltaText(r.deltaPct)}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(r.recent.regs)}</td>
                  <td className="px-2 py-1.5 text-left">{formatIls(r.recent.spend)}</td>
                </tr>
              );
            })}
            {active.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-[var(--muted)]">אין נתוני הרשמות בטווח.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">מסודר לפי עליית עלות ההרשמה — אזורים שהתייקרו למעלה. שורה מודגשת באדום = זינוק של 50%+ מול תחילת החודש.</div>

      <UacTrend points={report.daily} />
    </div>
  );
}
