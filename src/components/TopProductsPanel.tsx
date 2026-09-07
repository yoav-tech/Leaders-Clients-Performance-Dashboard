import type { TopProductsResult } from "@/lib/topProducts";
import { formatIls, formatNumber } from "@/lib/metrics";

// Best sellers for the store clients. The period is stated explicitly because it isn't the same
// on both platforms — Shopify gives us the report's exact range, QuickShop a rolling 30 days —
// and a table of revenue with an unstated period invites the wrong comparison.
const fmtD = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export default function TopProductsPanel({ data }: { data: TopProductsResult }) {
  if (!data.rows.length) return null;
  const totalRev = data.rows.reduce((a, r) => a + r.revenue, 0);
  const max = Math.max(...data.rows.map((r) => r.revenue), 1);
  const period = data.period === "range" && data.from && data.to
    ? `${fmtD(data.from)}–${fmtD(data.to)}`
    : "30 הימים האחרונים";

  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">מוצרים מובילים · לפי הכנסה</div>
        <div className="text-[11px] text-[var(--muted)]">{period}</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">מוצר</th>
              <th className="px-2 py-1.5 text-left">יחידות</th>
              <th className="px-2 py-1.5 text-left">הכנסות</th>
              <th className="px-2 py-1.5 text-left">חלק מהמכירות</th>
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
                <td className="px-2 py-1.5 text-left font-semibold">{formatIls(Math.round(r.revenue))}</td>
                <td className="px-2 py-1.5 text-left">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-[var(--muted)]">{totalRev ? `${Math.round((r.revenue / totalRev) * 100)}%` : "—"}</span>
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
              <td className="px-2 py-1.5 text-left">{formatNumber(data.rows.reduce((a, r) => a + r.quantity, 0))}</td>
              <td className="px-2 py-1.5 text-left">{formatIls(Math.round(totalRev))}</td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>
      {data.period === "last30d" && (
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          נתוני המוצרים בחנות זמינים ל־30 הימים האחרונים בלבד, ולכן הטווח כאן אינו זהה לשאר הדוח.
        </div>
      )}
    </div>
  );
}
