import type { TopProductsResult } from "@/lib/topProducts";
import { formatIls, formatNumber } from "@/lib/metrics";

// Best sellers for the store clients, over the report's own date range.
const fmtD = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export default function TopProductsPanel({ data }: { data: TopProductsResult }) {
  if (!data.rows.length) return null;
  const topRev = data.rows.reduce((a, r) => a + r.revenue, 0);
  const topUnits = data.rows.reduce((a, r) => a + r.quantity, 0);
  const max = Math.max(...data.rows.map((r) => r.revenue), 1);
  // Share is of the whole store, not of the top-ten subtotal.
  const ofStore = !!(data.storeRevenue && data.storeRevenue >= topRev);
  const base = ofStore ? data.storeRevenue! : topRev;
  const pct = (v: number) => (base ? `${((v / base) * 100).toFixed(1)}%` : "—");
  const shareLabel = ofStore ? "% מהכנסות החנות" : "% מהמובילים";
  const period = `${fmtD(data.from)}–${fmtD(data.to)}`;

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">מוצרים מובילים · לפי הכנסה</div>
        <div className="text-[11px] text-[var(--muted)]">{period}</div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="הכנסות המובילים" value={formatIls(Math.round(topRev))} />
        <Stat label={ofStore ? "חלקם מהכנסות החנות" : "מוצרים מובילים"} value={ofStore ? pct(topRev) : String(data.rows.length)} />
        <Stat label="יחידות שנמכרו" value={formatNumber(topUnits)} />
        <Stat label="מחיר ממוצע ליחידה" value={topUnits ? formatIls(Math.round(topRev / topUnits)) : "—"} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">מוצר</th>
              <th className="px-2 py-1.5 text-left">יחידות</th>
              <th className="px-2 py-1.5 text-left">מחיר ממוצע</th>
              <th className="px-2 py-1.5 text-left">הכנסות</th>
              <th className="px-2 py-1.5 text-left">{shareLabel}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 text-right">
                  <div className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-[11px] text-[var(--muted)]">{i + 1}</span>
                    <span className="font-medium">{r.name}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-left">{formatNumber(r.quantity)}</td>
                <td className="px-2 py-1.5 text-left text-[var(--muted)]">{formatIls(Math.round(r.avgPrice))}</td>
                <td className="px-2 py-1.5 text-left font-semibold">{formatIls(Math.round(r.revenue))}</td>
                <td className="px-2 py-1.5 text-left">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-[var(--muted)]">{pct(r.revenue)}</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--background)]">
                      <span className="block h-full bg-blue-600" style={{ width: `${(r.revenue / max) * 100}%` }} />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--card-border)] font-bold tabular-nums">
              <td className="px-2 py-1.5 text-right">סה״כ {data.rows.length} המובילים</td>
              <td className="px-2 py-1.5 text-left">{formatNumber(topUnits)}</td>
              <td className="px-2 py-1.5 text-left text-[var(--muted)]">{topUnits ? formatIls(Math.round(topRev / topUnits)) : "—"}</td>
              <td className="px-2 py-1.5 text-left">{formatIls(Math.round(topRev))}</td>
              <td className="px-2 py-1.5 text-left">{pct(topRev)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {data.distinctProducts != null && (
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          מתוך {formatNumber(data.distinctProducts)} מוצרים שנמכרו בתקופה.
        </div>
      )}
    </div>
  );
}
