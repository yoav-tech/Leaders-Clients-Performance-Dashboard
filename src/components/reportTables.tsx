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
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{report.topAds.length || 5} המודעות המובילות ברואס · מטא</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="w-8 px-2 py-1.5 text-right">#</th><th className="px-2 py-1.5 text-right">מודעה</th>
              <th className="px-2 py-1.5 text-left">הוצאה</th>
              <th className="px-2 py-1.5 text-left">הכנסות (מטא)</th><th className="px-2 py-1.5 text-left">ROAS (מטא)</th>
              <th className="px-2 py-1.5 text-left border-r border-[var(--card-border)]">הכנסות חנות</th><th className="px-2 py-1.5 text-left">רואס חנות</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {report.topAds.map((a, i) => (
              <tr key={a.name} className="border-t border-[var(--card-border)]">
                <td className="px-2 py-1.5 text-right text-[var(--muted)]">{i + 1}</td>
                <td className="max-w-[240px] truncate px-2 py-1.5 text-right font-medium" title={a.name} dir="ltr">
                  {a.previewUrl ? (
                    <a href={a.previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{a.name} <span aria-hidden>↗</span></a>
                  ) : a.name}
                </td>
                <td className="px-2 py-1.5 text-left">{formatIls(a.spend)}</td>
                <td className="px-2 py-1.5 text-left text-[var(--muted)]">{formatIls(a.revenue)}</td>
                <td className={`px-2 py-1.5 text-left ${TONE[roasTone(a.roas, report.target)]}`}>{formatRoas(a.roas)}</td>
                <td className="px-2 py-1.5 text-left font-semibold border-r border-[var(--card-border)]">{a.storeRevenue == null ? "—" : formatIls(a.storeRevenue)}</td>
                <td className={`px-2 py-1.5 text-left font-semibold ${a.storeRoas == null ? "" : TONE[roasTone(a.storeRoas, report.target)]}`}>{a.storeRoas == null ? "—" : formatRoas(a.storeRoas)}</td>
              </tr>
            ))}
            {report.topAds.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-center text-[var(--muted)]">אין מודעות עם מספיק הוצאה בטווח.</td></tr>}
            {report.topAds.length > 0 && (() => {
              const t = report.topAds.reduce((a, x) => ({ spend: a.spend + x.spend, metaRev: a.metaRev + x.revenue, storeRev: a.storeRev + (x.storeRevenue ?? 0) }), { spend: 0, metaRev: 0, storeRev: 0 });
              const metaRoas = t.spend ? t.metaRev / t.spend : null;
              const storeRoas = t.spend && t.storeRev ? t.storeRev / t.spend : null;
              return (
                <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                  <td className="px-2 py-1.5 text-right text-[var(--muted)]"></td>
                  <td className="px-2 py-1.5 text-right">סה״כ</td>
                  <td className="px-2 py-1.5 text-left">{formatIls(t.spend)}</td>
                  <td className="px-2 py-1.5 text-left text-[var(--muted)]">{formatIls(t.metaRev)}</td>
                  <td className={`px-2 py-1.5 text-left ${TONE[roasTone(metaRoas, report.target)]}`}>{formatRoas(metaRoas)}</td>
                  <td className="px-2 py-1.5 text-left border-r border-[var(--card-border)]">{t.storeRev ? formatIls(t.storeRev) : "—"}</td>
                  <td className={`px-2 py-1.5 text-left ${storeRoas == null ? "" : TONE[roasTone(storeRoas, report.target)]}`}>{storeRoas == null ? "—" : formatRoas(storeRoas)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">הכנסות/רואס (מטא) = ייחוס פיקסל מטא · הכנסות/רואס חנות = הכנסת אמת מהחנות לפי utm_content (שם המודעה).</div>
    </div>
  );
}
