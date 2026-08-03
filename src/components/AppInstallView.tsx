import type { BrandConfig } from "@/lib/brands";
import type { AppInstallStats } from "@/lib/appInstall";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";
import AppCampaignTable from "./AppCampaignTable";

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

// A funnel stage: big count + its CPA, with an optional conversion-rate from the previous stage.
function Stage({ label, count, cpaLabel, cpa, rate }: { label: string; count: number; cpaLabel: string; cpa: number | null; rate?: number | null }) {
  return (
    <div className="flex-1 rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">{formatNumber(count)}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">
        {cpaLabel} <span className="font-semibold text-[var(--foreground)]">{formatIls(cpa)}</span>
        {rate !== undefined ? <span className="ml-2">· {formatPct(rate)} מהשלב הקודם</span> : null}
      </div>
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
      <Panel title={`${brand.name} · app funnel · ${from} → ${to}`}>
        {/* Downloads → Registrations → Purchases, each with its own CPA */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Stage label="הורדות · Downloads" count={stats.installs} cpaLabel="CPI" cpa={stats.cpi} />
          <span className="self-center text-[var(--muted)]">→</span>
          <Stage label="הרשמות · Registrations" count={stats.registrations} cpaLabel="Cost/reg" cpa={stats.cpReg} rate={stats.installs ? stats.registrations / stats.installs : null} />
          <span className="self-center text-[var(--muted)]">→</span>
          <Stage label="רכישות · Purchases" count={stats.purchases} cpaLabel="Cost/purchase" cpa={stats.cpPurch} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Spend" value={formatIls(stats.spend)} />
          <Stat label="Impressions" value={formatNumber(stats.impressions)} />
          <Stat label="Clicks" value={formatNumber(stats.clicks)} />
          <Stat label="CTR" value={formatPct(stats.ctr)} />
          <Stat label="CPC" value={formatIls(stats.cpc)} />
          <Stat label="Install rate" value={formatPct(stats.installRate)} />
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">App campaign (Meta) · downloads = mobile app installs · live from Windsor. Purchases include in-app + web/in-store as reported by Meta.</div>
      </Panel>

      <Panel title="פירוט קמפיינים · by campaign">
        <AppCampaignTable campaigns={stats.campaigns} />
      </Panel>

      {stats.trend.length > 0 && (
        <Panel title="Daily">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-left">Day</th>
                  <th className="px-2 py-1.5 text-right">Spend</th>
                  <th className="px-2 py-1.5 text-right">Downloads</th>
                  <th className="px-2 py-1.5 text-right">Reg</th>
                  <th className="px-2 py-1.5 text-right">CPI</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...stats.trend].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.spend)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(d.installs)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(d.registrations)}</td>
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
