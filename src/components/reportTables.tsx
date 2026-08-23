import type { ClientReport } from "@/lib/clientReport";
import { formatIls, formatPct, formatRoas, roasTone } from "@/lib/metrics";

// Shared report tables — used by the client view (ClientSummaryView) and the manager view
// (ClientReportPanels) so the markup lives in one place.

const TONE: Record<string, string> = { good: "text-[var(--good)]", warn: "text-[var(--warn)]", bad: "text-[var(--bad)]", none: "text-[var(--muted)]" };

export function PlatformTable({ report }: { report: ClientReport }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">ביצועים לפי פלטפורמה</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-right">פלטפורמה</th>
              <th className="px-2 py-1.5 text-left">הוצאה</th><th className="px-2 py-1.5 text-left">הכנסות</th>
              <th className="px-2 py-1.5 text-left">ROAS</th><th className="px-2 py-1.5 text-left">המרה</th><th className="px-2 py-1.5 text-left">סל ממוצע</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {report.platforms.map((p) => (
              <tr key={p.platform} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 text-right font-medium" dir="ltr">{p.platform}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(p.spend)}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(p.revenue)}</td>
                <td className={`px-2 py-1.5 text-left ${TONE[roasTone(p.roas, report.target)]}`}>{formatRoas(p.roas)}</td>
                <td className="px-2 py-1.5 text-left">{formatPct(p.cvr)}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(p.aov)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TopAdsTable({ report }: { report: ClientReport }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">5 המודעות המובילות ברואס · מטא</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="w-8 px-2 py-1.5 text-right">#</th><th className="px-2 py-1.5 text-right">מודעה</th>
              <th className="px-2 py-1.5 text-left">הוצאה</th><th className="px-2 py-1.5 text-left">הכנסות</th><th className="px-2 py-1.5 text-left">ROAS</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {report.topAds.map((a, i) => (
              <tr key={a.name} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 text-right text-[var(--muted)]">{i + 1}</td>
                <td className="max-w-[280px] truncate px-2 py-1.5 text-right font-medium" title={a.name} dir="ltr">
                  {a.previewUrl ? (
                    <a href={a.previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{a.name} <span aria-hidden>↗</span></a>
                  ) : a.name}
                </td>
                <td className="px-2 py-1.5 text-left">{formatIls(a.spend)}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(a.revenue)}</td>
                <td className={`px-2 py-1.5 text-left ${TONE[roasTone(a.roas, report.target)]}`}>{formatRoas(a.roas)}</td>
              </tr>
            ))}
            {report.topAds.length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-center text-[var(--muted)]">אין מודעות עם מספיק הוצאה בטווח.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
