import type { BrandConfig } from "@/lib/brands";
import type { BrandMetrics, Channel, ChannelMetrics, DayBreakdown } from "@/lib/types";
import type { StoreAnalytics } from "@/lib/storeAnalytics";
import { monthProgress } from "@/lib/dates";
import {
  computePacing,
  deltaPct,
  deltaTone,
  formatDelta,
  formatIls,
  formatNumber,
  formatPct,
  formatRoas,
  roasTone,
} from "@/lib/metrics";
import Sparkline from "./Sparkline";
import BreakdownExplorer from "./BreakdownExplorer";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};
const DIV = "border-l border-[var(--card-border)]";

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      {title && (
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      )}
      {children}
    </div>
  );
}

function DeltaBadge({ metric, delta }: { metric: string; delta: number | null }) {
  if (delta === null) return null;
  return (
    <span className={`ml-1 text-[11px] font-medium ${TONE[deltaTone(metric, delta)]}`}>
      {formatDelta(delta)}
    </span>
  );
}

function Kpi({
  label,
  value,
  metric,
  cur,
  prev,
  tone,
}: {
  label: string;
  value: string;
  metric: string;
  cur: number | null;
  prev: number | null;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 flex items-baseline">
        <span className={`text-lg font-bold ${tone ? TONE[tone] : ""}`}>{value}</span>
        <DeltaBadge metric={metric} delta={deltaPct(cur, prev)} />
      </div>
    </div>
  );
}

const CH_LABEL: Record<Channel, string> = { google: "Google", meta: "Meta", tiktok: "TikTok", site: "Site" };

export default function BrandView({
  brand,
  metrics,
  breakdown,
  store,
  monthSpend,
  from,
  to,
}: {
  brand: BrandConfig;
  metrics: BrandMetrics;
  breakdown: DayBreakdown[];
  store: StoreAnalytics | null;
  monthSpend: number;
  from: string;
  to: string;
}) {
  const { total, channels, blendedRoas, cac, newRevenue, returningRevenue, previous } = metrics;
  const p = previous;
  const target = brand.targetRoas;

  const storeRev = channels.site.revenue;
  const siteOrders = channels.site.purchases;
  const storeAov = siteOrders ? storeRev / siteOrders : null;
  const prevStoreAov = p && p.siteOrders ? p.siteRevenue / p.siteOrders : null;
  const newPct = storeRev ? (newRevenue / storeRev) * 100 : 0;
  // Store CVR = orders ÷ ad clicks (paid visitors). No total-site-visitors feed, so the
  // denominator is paid traffic; excludes organic/direct.
  const storeCvr = total.clicks ? siteOrders / total.clicks : null;
  const prevStoreCvr = p && p.clicks ? p.siteOrders / p.clicks : null;

  // Store (the real business outcome) — shown first.
  const storeKpis = [
    { label: "Store Revenue", metric: "siteRevenue", value: formatIls(storeRev), cur: storeRev, prev: p?.siteRevenue ?? null },
    { label: "Orders", metric: "storeOrders", value: formatNumber(siteOrders), cur: siteOrders, prev: p?.siteOrders ?? null },
    { label: "Store AOV", metric: "aov", value: formatIls(storeAov), cur: storeAov, prev: prevStoreAov },
    { label: "Store CVR", metric: "storeCvr", value: formatPct(storeCvr), cur: storeCvr, prev: prevStoreCvr },
    { label: "Blended ROAS", metric: "blendedRoas", value: formatRoas(blendedRoas), cur: blendedRoas, prev: p?.blendedRoas ?? null, tone: roasTone(blendedRoas, target) },
    { label: "CAC", metric: "cac", value: formatIls(cac), cur: cac, prev: p?.cac ?? null },
  ];
  // Ads (platform-attributed).
  const adKpis = [
    { label: "Spend", metric: "spend", value: formatIls(total.spend), cur: total.spend, prev: p?.spend ?? null },
    { label: "Ad Revenue", metric: "revenue", value: formatIls(total.revenue), cur: total.revenue, prev: p?.revenue ?? null },
    { label: "ROAS", metric: "roas", value: formatRoas(total.roas), cur: total.roas, prev: p?.roas ?? null, tone: roasTone(total.roas, target) },
    { label: "Purchases", metric: "purchases", value: formatNumber(total.purchases), cur: total.purchases, prev: p?.purchases ?? null },
    { label: "CPA", metric: "cpa", value: formatIls(total.cpa), cur: total.cpa, prev: p?.cpa ?? null },
  ];

  const { elapsed, daysInMonth } = monthProgress();
  const pacing = brand.monthlyBudget > 0 ? computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth) : null;

  return (
    <div className="space-y-4">
      {/* Store results first (the real business), then ads performance. */}
      <Panel title="Store · results · vs previous period">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {storeKpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">Store CVR = orders ÷ ad clicks (paid visitors; excludes organic/direct)</div>
      </Panel>

      <Panel title="Ads · performance · vs previous period">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {adKpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>
      </Panel>

      {/* Pacing */}
      {pacing && (
        <Panel title="Budget pacing · this month">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Monthly budget" value={formatIls(pacing.budget)} />
            <Stat label="Spent (MTD)" value={formatIls(pacing.spend)} />
            <Stat label="Projected EOM" value={formatIls(pacing.projected)} tone={pacing.projected > pacing.budget ? "bad" : "good"} />
            <Stat label="Pace" value={pacing.pacePct === null ? "—" : `${Math.round(pacing.pacePct)}%`} tone={pacing.pacePct && pacing.pacePct > 110 ? "warn" : "none"} />
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (pacing.spend / (pacing.budget || 1)) * 100)}%` }} />
          </div>
        </Panel>
      )}

      {/* Per-channel funnel table */}
      <Panel title="Channels · funnel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Channel</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Impr</th>
                <th className="px-2 py-1.5 text-right">Clicks</th>
                <th className="px-2 py-1.5 text-right">CTR</th>
                <th className="px-2 py-1.5 text-right">CPC</th>
                <th className="px-2 py-1.5 text-right">CPM</th>
                <th className={`px-2 py-1.5 text-right ${DIV}`}>Purch</th>
                <th className="px-2 py-1.5 text-right">CVR</th>
                <th className="px-2 py-1.5 text-right">Revenue</th>
                <th className="px-2 py-1.5 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(["google", "meta", "tiktok"] as Channel[]).map((ch) => (
                <ChannelRow key={ch} c={channels[ch]} target={target} />
              ))}
              <TotalRow c={total} target={target} blended={blendedRoas} />
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          Purch · CVR · Revenue · ROAS are <span className="text-[var(--foreground)]">store-attributed</span> (first-party UTM from real orders); Spend · Impr · Clicks are platform-reported. Organic/direct/SMS traffic isn&apos;t credited to a channel (it shows in Blended).
        </div>
      </Panel>

      {/* Unit economics + store insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="New vs returning · store revenue">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`New (${Math.round(newPct)}%)`} value={formatIls(newRevenue)} />
            <Stat label={`Returning (${Math.round(100 - newPct)}%)`} value={formatIls(returningRevenue)} />
          </div>
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full bg-[var(--good)]" style={{ width: `${newPct}%` }} />
            <div className="h-full bg-blue-600" style={{ width: `${100 - newPct}%` }} />
          </div>
        </Panel>
        {store && <StoreInsights store={store} />}
      </div>

      {/* Trend */}
      <Panel title="Trend · ROAS">
        <Sparkline data={breakdown.map((d) => ({ date: d.date, roas: d.blendedRoas, revenue: d.channels.site.revenue })).reverse()} />
      </Panel>

      {/* Breakdown explorer (on-demand) */}
      <BreakdownExplorer brandId={brand.id} from={from} to={to} />

      {/* Daily breakdown */}
      <Panel title={`Daily · ${from} → ${to}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Day</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Ad Rev</th>
                <th className="px-2 py-1.5 text-right">ROAS</th>
                <th className="px-2 py-1.5 text-right">Purch</th>
                <th className="px-2 py-1.5 text-right">CPA</th>
                <th className={`px-2 py-1.5 text-right ${DIV}`}>Site Rev</th>
                <th className="px-2 py-1.5 text-right">AOV</th>
                <th className="px-2 py-1.5 text-right">CVR</th>
                <th className="px-2 py-1.5 text-right">CAC</th>
                <th className="px-2 py-1.5 text-right">Blended</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {breakdown.map((d) => {
                const site = d.channels.site;
                const aov = site.purchases ? site.revenue / site.purchases : null;
                const cvr = d.total.clicks ? site.purchases / d.total.clicks : null;
                const cac = d.newCustomers ? d.total.spend / d.newCustomers : null;
                return (
                  <tr key={d.date} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.total.spend)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.total.revenue)}</td>
                    <td className={`px-2 py-1.5 text-right ${TONE[roasTone(d.total.roas, target)]}`}>{formatRoas(d.total.roas)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(d.total.purchases)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.total.cpa)}</td>
                    <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatIls(site.revenue)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(aov)}</td>
                    <td className="px-2 py-1.5 text-right">{formatPct(cvr)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(cac)}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${TONE[roasTone(d.blendedRoas, target)]}`}>{formatRoas(d.blendedRoas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
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

function ChannelRow({ c, target }: { c: ChannelMetrics; target: number }) {
  return (
    <tr className="border-t border-[var(--card-border)]">
      <td className="px-2 py-1.5 text-left font-medium">{CH_LABEL[c.channel]}</td>
      <td className="px-2 py-1.5 text-right">{c.spend ? formatIls(c.spend) : "—"}</td>
      <td className="px-2 py-1.5 text-right">{c.impressions ? formatNumber(c.impressions) : "—"}</td>
      <td className="px-2 py-1.5 text-right">{c.clicks ? formatNumber(c.clicks) : "—"}</td>
      <td className="px-2 py-1.5 text-right">{formatPct(c.ctr)}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.cpc)}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.cpm)}</td>
      <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(c.purchases)}</td>
      <td className="px-2 py-1.5 text-right">{formatPct(c.cvr)}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.revenue)}</td>
      <td className={`px-2 py-1.5 text-right ${TONE[roasTone(c.roas, target)]}`}>{formatRoas(c.roas)}</td>
    </tr>
  );
}

function SiteRow({ c }: { c: ChannelMetrics }) {
  return (
    <tr className="border-t border-[var(--card-border)] text-[var(--muted)]">
      <td className="px-2 py-1.5 text-left font-medium">Site</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(c.purchases)}</td>
      <td className="px-2 py-1.5 text-right">—</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.revenue)}</td>
      <td className="px-2 py-1.5 text-right">—</td>
    </tr>
  );
}

function TotalRow({ c, target, blended }: { c: ChannelMetrics; target: number; blended: number | null }) {
  return (
    <tr className="border-t-2 border-[var(--card-border)] font-semibold">
      <td className="px-2 py-1.5 text-left">Total</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.spend)}</td>
      <td className="px-2 py-1.5 text-right">{formatNumber(c.impressions)}</td>
      <td className="px-2 py-1.5 text-right">{formatNumber(c.clicks)}</td>
      <td className="px-2 py-1.5 text-right">{formatPct(c.ctr)}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.cpc)}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.cpm)}</td>
      <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(c.purchases)}</td>
      <td className="px-2 py-1.5 text-right">{formatPct(c.cvr)}</td>
      <td className="px-2 py-1.5 text-right">{formatIls(c.revenue)}</td>
      <td className={`px-2 py-1.5 text-right ${TONE[roasTone(c.roas, target)]}`}>
        {formatRoas(c.roas)}
        <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">blend {formatRoas(blended)}</span>
      </td>
    </tr>
  );
}

function StoreInsights({ store }: { store: StoreAnalytics }) {
  return (
    <Panel title="Store · last 30 days">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="AOV" value={formatIls(store.aov)} />
        <Stat label="New customers" value={formatNumber(store.newCustomers)} />
        <Stat
          label="Rev vs prev"
          value={store.revenueGrowthPct === null ? "—" : formatDelta(store.revenueGrowthPct)}
          tone={store.revenueGrowthPct === null ? "none" : store.revenueGrowthPct >= 0 ? "good" : "bad"}
        />
      </div>
      {store.topProducts.length > 0 && (
        <div className="mt-3 text-xs">
          <div className="text-[var(--muted)]">Top products</div>
          {store.topProducts.map((pr) => (
            <div key={pr.name} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{pr.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--muted)]">{formatIls(pr.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
