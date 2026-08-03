import type { BrandConfig } from "@/lib/brands";
import type { AppInstallStats } from "@/lib/appInstall";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}

export default function AppInstallView({
  brand,
  stats,
  from,
  to,
}: {
  brand: BrandConfig;
  stats: AppInstallStats;
  from: string;
  to: string;
}) {
  return (
    <div className="space-y-4">
      <Panel title={`${brand.name} · app installs · ${from} → ${to}`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Spend" value={formatIls(stats.spend)} />
          <Stat label="Installs" value={formatNumber(stats.installs)} />
          <Stat label="CPI" value={formatIls(stats.cpi)} />
          <Stat label="In-app purchases" value={formatNumber(stats.purchases)} />
          <Stat label="Cost / purchase" value={formatIls(stats.costPerPurchase)} />
          <Stat label="Install rate" value={formatPct(stats.installRate)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Impressions" value={formatNumber(stats.impressions)} />
          <Stat label="Clicks" value={formatNumber(stats.clicks)} />
          <Stat label="CTR" value={formatPct(stats.ctr)} />
          <Stat label="CPC" value={formatIls(stats.cpc)} />
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">App-install campaign (Meta). Installs = mobile app installs · CPI = spend ÷ installs · live from Windsor.</div>
      </Panel>

      <Panel title="By campaign">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Campaign</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Impr</th>
                <th className="px-2 py-1.5 text-right">Clicks</th>
                <th className="px-2 py-1.5 text-right">CTR</th>
                <th className="px-2 py-1.5 text-right">Installs</th>
                <th className="px-2 py-1.5 text-right">CPI</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.campaigns.map((c) => (
                <tr key={c.name} className="border-t border-[var(--card-border)]">
                  <td className="max-w-[240px] truncate px-2 py-1.5 text-left font-medium" title={c.name}>{c.name}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(c.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(c.impressions)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(c.clicks)}</td>
                  <td className="px-2 py-1.5 text-right">{formatPct(c.ctr)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(c.installs)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(c.cpi)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                <td className="px-2 py-1.5 text-left">Total</td>
                <td className="px-2 py-1.5 text-right">{formatIls(stats.spend)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(stats.impressions)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(stats.clicks)}</td>
                <td className="px-2 py-1.5 text-right">{formatPct(stats.ctr)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(stats.installs)}</td>
                <td className="px-2 py-1.5 text-right">{formatIls(stats.cpi)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {stats.trend.length > 0 && (
        <Panel title="Daily">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-left">Day</th>
                  <th className="px-2 py-1.5 text-right">Spend</th>
                  <th className="px-2 py-1.5 text-right">Installs</th>
                  <th className="px-2 py-1.5 text-right">CPI</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...stats.trend].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.spend)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(d.installs)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.installs ? d.spend / d.installs : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
