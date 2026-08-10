// Awareness report (e.g. SCJ) — reach/views campaigns that live inside SHARED ad accounts
// (Leaders on Meta, LDRS on Google), identified by a campaign-name filter (e.g. "scj").
// Pulls per-platform + per-campaign awareness metrics (impressions, reach, views, CPM, CPV).

import type { BrandConfig, AwarenessSourceConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { type AdLevel, groupFieldFor, campaignFieldFor } from "./adLevel";

const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);
const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}

export interface AwCampaign {
  platform: "meta" | "google" | "tiktok";
  name: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  cpm: number | null;
  views: number;
  completedViews: number;
  cpv: number | null;
}
export interface AwSource {
  key: string;
  title: string;
  platform: "meta" | "google" | "tiktok";
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  cpm: number | null;
  views: number;
  completedViews: number;
  cpv: number | null;
  campaigns: AwCampaign[];
}
export interface AwarenessReport {
  sources: AwSource[];
  totals: { spend: number; impressions: number; reach: number; views: number; cpm: number | null; cpv: number | null };
  trend: { date: string; spend: number; views: number }[];
}

async function fetchSource(cfg: AwarenessSourceConfig, brand: BrandConfig, from: string, to: string, filter: string, level: AdLevel): Promise<AwSource> {
  const acc = normId(cfg.account);
  let cur = brand.nativeCurrency as string;
  const zero = () => ({ spend: 0, impressions: 0, reach: 0, views: 0, completedViews: 0 });
  const byCamp = new Map<string, ReturnType<typeof zero>>();

  // Always fetch the campaign field (for the name filter) plus the group-by field for the level.
  const campField = campaignFieldFor(cfg.platform);
  const groupField = groupFieldFor(cfg.platform, level);
  const metricFields =
    cfg.platform === "meta"
      ? ["currency", "reach", "video_thruplay_watched_actions", "video_p100_watched_actions"]
      : cfg.platform === "tiktok"
        ? ["currency", "reach", "video_watched_2s", "video_watched_6s"]
        : ["video_views"];
  const fields = [...new Set(["account_id", "spend", "impressions", campField, groupField, ...metricFields])];

  const rows = await fetchWindsor({
    connector: cfg.platform === "meta" ? "facebook" : cfg.platform === "tiktok" ? "tiktok" : "google_ads",
    fields,
    dateFrom: from,
    dateTo: to,
    accounts: [cfg.account],
    ...(cfg.platform === "meta" ? { options: { attribution_window: "7d_click,1d_view" } } : {}),
    cacheSeconds: 60,
  }).catch(() => []);

  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    if (!String(r[campField] ?? "").toLowerCase().includes(filter)) continue; // filter by campaign name
    const name = String(r[groupField] ?? "") || "(none)"; // group by the chosen level
    if (r.currency) cur = String(r.currency).toUpperCase();
    const c = byCamp.get(name) ?? zero();
    c.spend += num(r.spend);
    c.impressions += num(r.impressions);
    if (cfg.platform === "meta") {
      c.reach += num(r.reach);
      c.views += sumAction(r.video_thruplay_watched_actions);
      c.completedViews += sumAction(r.video_p100_watched_actions);
    } else if (cfg.platform === "tiktok") {
      c.reach += num(r.reach);
      c.views += num(r.video_watched_2s); // matches the media plan's TikTok "views" definition
      c.completedViews += num(r.video_watched_6s); // 6s+ views (TikTok's qualified-view metric)
    } else {
      c.views += num(r.video_views);
    }
    byCamp.set(name, c);
  }

  const campaigns: AwCampaign[] = [...byCamp].map(([name, c]) => {
    const spend = toIls(c.spend, cur);
    return {
      platform: cfg.platform,
      name,
      spend: Math.round(spend),
      impressions: Math.round(c.impressions),
      reach: Math.round(c.reach),
      frequency: c.reach ? c.impressions / c.reach : null,
      cpm: c.impressions ? (spend / c.impressions) * 1000 : null,
      views: Math.round(c.views),
      completedViews: Math.round(c.completedViews),
      cpv: c.views ? spend / c.views : null,
    };
  }).sort((a, b) => b.spend - a.spend);

  const t = campaigns.reduce((a, c) => {
    a.spend += c.spend; a.impressions += c.impressions; a.reach += c.reach; a.views += c.views; a.completedViews += c.completedViews;
    return a;
  }, zero());

  return {
    key: `${cfg.platform}-${cfg.account}`,
    title: cfg.title,
    platform: cfg.platform,
    spend: Math.round(t.spend),
    impressions: Math.round(t.impressions),
    reach: Math.round(t.reach),
    frequency: t.reach ? t.impressions / t.reach : null,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
    views: Math.round(t.views),
    completedViews: Math.round(t.completedViews),
    cpv: t.views ? t.spend / t.views : null,
    campaigns,
  };
}

async function fetchTrend(cfg: AwarenessSourceConfig, from: string, to: string, filter: string): Promise<Map<string, { spend: number; views: number }>> {
  const acc = normId(cfg.account);
  const fields = cfg.platform === "meta"
    ? ["date", "account_id", "campaign", "spend", "video_thruplay_watched_actions"]
    : cfg.platform === "tiktok"
      ? ["date", "account_id", "campaign_name", "spend", "video_watched_2s"]
      : ["date", "account_id", "campaign", "spend", "video_views"];
  const rows = await fetchWindsor({ connector: cfg.platform === "meta" ? "facebook" : cfg.platform === "tiktok" ? "tiktok" : "google_ads", fields, dateFrom: from, dateTo: to, accounts: [cfg.account], cacheSeconds: 60 }).catch(() => []);
  const m = new Map<string, { spend: number; views: number }>();
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const name = String((cfg.platform === "tiktok" ? r.campaign_name : r.campaign) ?? "");
    if (!name.toLowerCase().includes(filter)) continue;
    const d = String(r.date ?? "").slice(0, 10);
    if (!d) continue;
    const e = m.get(d) ?? { spend: 0, views: 0 };
    e.spend += num(r.spend);
    e.views += cfg.platform === "meta" ? sumAction(r.video_thruplay_watched_actions) : cfg.platform === "tiktok" ? num(r.video_watched_2s) : num(r.video_views);
    m.set(d, e);
  }
  return m;
}

export async function getAwarenessReport(brand: BrandConfig, from: string, to: string, level: AdLevel = "campaign"): Promise<AwarenessReport | null> {
  if (!brand.awarenessSources?.length) return null;
  const filter = (brand.campaignFilter ?? "").toLowerCase();

  // Fetch all source + trend queries concurrently (Windsor is slow, esp. Meta video fields).
  // Trend stays campaign-scoped (a time series) regardless of the table's drill level.
  const [sources, trendMaps] = await Promise.all([
    Promise.all(brand.awarenessSources.map((s) => fetchSource(s, brand, from, to, filter, level))),
    Promise.all(brand.awarenessSources.map((s) => fetchTrend(s, from, to, filter))),
  ]);

  const T = sources.reduce((a, s) => ({ spend: a.spend + s.spend, impressions: a.impressions + s.impressions, reach: a.reach + s.reach, views: a.views + s.views }), { spend: 0, impressions: 0, reach: 0, views: 0 });
  const totals = {
    spend: T.spend, impressions: T.impressions, reach: T.reach, views: T.views,
    cpm: T.impressions ? (T.spend / T.impressions) * 1000 : null,
    cpv: T.views ? T.spend / T.views : null,
  };

  const byDate = new Map<string, { spend: number; views: number }>();
  for (const m of trendMaps) {
    for (const [d, e] of m) {
      const x = byDate.get(d) ?? { spend: 0, views: 0 };
      x.spend += e.spend;
      x.views += e.views;
      byDate.set(d, x);
    }
  }
  const trend = [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, e]) => ({ date, spend: Math.round(e.spend), views: Math.round(e.views) }));

  return { sources, totals, trend };
}
