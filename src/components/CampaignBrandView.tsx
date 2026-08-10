import type { BrandConfig } from "@/lib/brands";
import { campaignTargetOf } from "@/lib/brands";
import type { CampBrandMetrics, CampChannel } from "@/lib/campaignMetrics";
import { monthProgress } from "@/lib/dates";
import { computePacing, deltaPct, formatDelta, formatIls, formatNumber, formatPct } from "@/lib/metrics";
import CampaignTrend from "./CampaignTrend";
import CampaignExplorer from "./CampaignExplorer";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};
const DIV = "border-l border-[var(--card-border)]";
const CH_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", total: "Total" };
const cpv = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(3)}`);
const cpm = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(1)}`);
const freq = (v: number | null) => (v == null ? "—" : v.toFixed(2));

const HIGHER_BETTER = new Set(["views", "reach", "impressions", "clicks", "leads"]);
const LOWER_BETTER = new Set(["cpv", "cpl", "cpm", "cpc"]);
function deltaTone(metric: string, delta: number | null): string {
  if (delta == null) return "none";
  if (HIGHER_BETTER.has(metric)) return delta >= 0 ? "good" : "bad";
  if (LOWER_BETTER.has(metric)) return delta <= 0 ? "good" : "bad";
  return "none";
}
function goalTone(v: number | null, target: number | null): string {
  if (v == null || !target) return "none";
  if (v <= target) return "good";
  if (v <= target * 1.3) return "warn";
  return "bad";
}

function Panel({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
function Kpi({ label, value, metric, cur, prev, tone }: { label: string; value: string; metric: string; cur: number | null; prev: number | null; tone?: string }) {
  const delta = deltaPct(cur, prev);
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 flex items-baseline">
        <span className={`text-lg font-bold ${tone ? TONE[tone] : ""}`}>{value}</span>
        {delta != null && <span className={`ml-1 text-[11px] font-medium ${TONE[deltaTone(metric, delta)]}`}>{formatDelta(delta)}</span>}
      </div>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`text-lg font-bold ${tone ? TONE[tone] : ""}`}>{value}</div>
    </div>
  );
}

export default function CampaignBrandView({
  brand,
  metrics,
  monthSpend,
  from,
  to,
  channels,
}: {
  brand: BrandConfig;
  metrics: CampBrandMetrics;
  monthSpend: number;
  from: string;
  to: string;
  channels: { id: "meta" | "google" | "tiktok"; label: string }[];
}) {
  const { profile, total, channels: chs, daily, previous } = metrics;
  const target = campaignTargetOf(brand);
  const isViews = profile === "views";

  const kpis = isViews
    ? [
        { label: "Spend", metric: "spend", value: formatIls(total.spend), cur: total.spend, prev: previous.spend },
        { label: "Impressions", metric: "impressions", value: formatNumber(total.impressions), cur: total.impressions, prev: previous.impressions },
        { label: "Reach", metric: "reach", value: formatNumber(total.reach), cur: total.reach, prev: previous.reach },
        { label: "Views", metric: "views", value: formatNumber(total.views), cur: total.views, prev: previous.views },
        { label: "CPM", metric: "cpm", value: cpm(total.cpm), cur: total.cpm, prev: null },
        { label: "CPV", metric: "cpv", value: cpv(total.cpv), cur: total.cpv, prev: previous.cpv, tone: goalTone(total.cpv, target) },
      ]
    : [
        { label: "Spend", metric: "spend", value: formatIls(total.spend), cur: total.spend, prev: previous.spend },
        { label: "Impressions", metric: "impressions", value: formatNumber(total.impressions), cur: total.impressions, prev: previous.impressions },
        { label: "Clicks", metric: "clicks", value: formatNumber(total.clicks), cur: total.clicks, prev: previous.clicks },
        { label: "CTR", metric: "ctr", value: formatPct(total.ctr), cur: total.ctr, prev: null },
        { label: "Leads", metric: "leads", value: formatNumber(total.leads), cur: total.leads, prev: previous.leads },
        { label: "CPL", metric: "cpl", value: formatIls(total.cpl), cur: total.cpl, prev: previous.cpl, tone: goalTone(total.cpl, target) },
      ];

  const { elapsed, daysInMonth } = monthProgress();
  const pacing = brand.monthlyBudget > 0 ? computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth) : null;

  return (
    <div className="space-y-4">
      {/* 1 · Overview */}
      <Panel title={`${isViews ? "Awareness" : "Leads"} · results · vs previous period`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => <Kpi key={k.label} {...k} />)}
        </div>
      </Panel>

      {/* 2 · Budget pacing */}
      {pacing && (() => {
        const remaining = Math.max(0, pacing.budget - pacing.spend);
        return (
          <Panel title="Budget pacing · this month">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Monthly budget" value={formatIls(pacing.budget)} />
              <Stat label="Spent (MTD)" value={formatIls(pacing.spend)} />
              <Stat label="Remaining" value={formatIls(remaining)} />
              <Stat label="Projected EOM" value={formatIls(pacing.projected)} tone={pacing.projected > pacing.budget ? "bad" : "good"} />
              <Stat label="Pace" value={pacing.pacePct === null ? "—" : `${Math.round(pacing.pacePct)}%`} tone={pacing.pacePct && pacing.pacePct > 110 ? "warn" : "none"} />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
              <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (pacing.spend / (pacing.budget || 1)) * 100)}%` }} />
            </div>
          </Panel>
        );
      })()}

      {/* 3 · Channel funnel */}
      <Panel title="Channels · funnel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Channel</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Impr</th>
                {isViews ? (
                  <>
                    <th className="px-2 py-1.5 text-right">Reach</th>
                    <th className="px-2 py-1.5 text-right">Freq</th>
                    <th className="px-2 py-1.5 text-right">CPM</th>
                    <th className={`px-2 py-1.5 text-right ${DIV}`}>Views</th>
                    <th className="px-2 py-1.5 text-right">100%</th>
                    <th className="px-2 py-1.5 text-right">CPV</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-1.5 text-right">Clicks</th>
                    <th className="px-2 py-1.5 text-right">CTR</th>
                    <th className="px-2 py-1.5 text-right">CPC</th>
                    <th className={`px-2 py-1.5 text-right ${DIV}`}>Leads</th>
                    <th className="px-2 py-1.5 text-right">CPL</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {chs.map((c) => <FunnelRow key={c.channel} c={c} isViews={isViews} target={target} />)}
              <FunnelRow c={total} isViews={isViews} target={target} bold />
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">חי מ-Windsor, נשמר יומית ב-DB · {isViews ? "Meta Views = ThruPlay · TikTok Views = 2s+ (100% = 6s+)" : "Meta = לידים · Google = conversions"}.</div>
      </Panel>

      {/* 4 · Trend (per field) */}
      <Panel title="Trend">
        <CampaignTrend daily={daily} profile={profile} />
      </Panel>

      {/* 5 · Breakdown explorer */}
      <CampaignExplorer brandId={brand.id} from={from} to={to} profile={profile} channels={channels} target={target} />

      {/* 6 · Daily */}
      <Panel title="Daily">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Day</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Impr</th>
                {isViews ? (
                  <>
                    <th className="px-2 py-1.5 text-right">Reach</th>
                    <th className="px-2 py-1.5 text-right">Views</th>
                    <th className="px-2 py-1.5 text-right">CPV</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-1.5 text-right">Clicks</th>
                    <th className="px-2 py-1.5 text-right">Leads</th>
                    <th className="px-2 py-1.5 text-right">CPL</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(d.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(d.impressions)}</td>
                  {isViews ? (
                    <>
                      <td className="px-2 py-1.5 text-right">{formatNumber(d.reach)}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(d.views)}</td>
                      <td className={`px-2 py-1.5 text-right ${TONE[goalTone(d.views ? d.spend / d.views : null, target)]}`}>{cpv(d.views ? d.spend / d.views : null)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right">{formatNumber(d.clicks)}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(d.leads)}</td>
                      <td className={`px-2 py-1.5 text-right ${TONE[goalTone(d.leads ? d.spend / d.leads : null, target)]}`}>{formatIls(d.leads ? d.spend / d.leads : null)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FunnelRow({ c, isViews, target, bold }: { c: CampChannel; isViews: boolean; target: number | null; bold?: boolean }) {
  const rowCls = bold ? "border-t-2 border-[var(--card-border)] font-semibold" : "border-t border-[var(--card-border)]";
  return (
    <tr className={rowCls}>
      <td className="px-2 py-1.5 text-left font-medium">{CH_LABEL[c.channel]}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.spend)}</td>
      <td className="px-2 py-1.5 text-right">{formatNumber(c.impressions)}</td>
      {isViews ? (
        <>
          <td className="px-2 py-1.5 text-right">{formatNumber(c.reach)}</td>
          <td className="px-2 py-1.5 text-right">{freq(c.frequency)}</td>
          <td className="px-2 py-1.5 text-right">{cpm(c.cpm)}</td>
          <td className={`px-2 py-1.5 text-right font-semibold ${DIV}`}>{formatNumber(c.views)}</td>
          <td className="px-2 py-1.5 text-right">{formatNumber(c.completed)}</td>
          <td className={`px-2 py-1.5 text-right ${TONE[goalTone(c.cpv, target)]}`}>{cpv(c.cpv)}</td>
        </>
      ) : (
        <>
          <td className="px-2 py-1.5 text-right">{formatNumber(c.clicks)}</td>
          <td className="px-2 py-1.5 text-right">{formatPct(c.ctr)}</td>
          <td className="px-2 py-1.5 text-right">{formatIls(c.cpc)}</td>
          <td className={`px-2 py-1.5 text-right font-semibold ${DIV}`}>{formatNumber(c.leads)}</td>
          <td className={`px-2 py-1.5 text-right ${TONE[goalTone(c.cpl, target)]}`}>{formatIls(c.cpl)}</td>
        </>
      )}
    </tr>
  );
}
