// General campaign-performance report (e.g. Leaders / Bestie). Pulls campaigns from shared
// Meta + Google accounts, filtered by campaign-name substring, and shows a per-campaign table:
// spend, impressions, clicks, CTR, CPC, and conversions (Meta leads / Google conversions).
// Mixed campaign types (engagement, reach, search, lead-gen) — so it's a general table, not the
// awareness-specific (reach/views) view.

import type { BrandConfig, PerfSourceConfig } from "./brands";
import { fetchWindsor, num, type WindsorRow } from "./windsor";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();

// Meta action fields arrive either as a number or a nested [{action_type,value}] array.
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s, x) => s + num((x as { value?: unknown })?.value as number), 0);
  return num(v as number | string | null | undefined);
}

export interface PerfCampaign {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  conv: number;
}
export interface PerfSource {
  key: string;
  title: string;
  platform: "meta" | "google";
  currency: string;
  convLabel: string; // "Leads" (Meta) | "Conversions" (Google)
  campaigns: PerfCampaign[];
  totals: PerfCampaign;
}
export interface CampaignPerf {
  sources: PerfSource[];
}

type Agg = { spend: number; impr: number; clicks: number; conv: number };

async function fetchSource(cfg: PerfSourceConfig, filter: string, from: string, to: string): Promise<PerfSource> {
  const acc = normId(cfg.account);
  const isMeta = cfg.platform === "meta";
  const convField = isMeta ? "actions_lead" : "conversions";
  const fields = ["account_id", "currency", "campaign", "spend", "impressions", "clicks", convField];

  const rows = await fetchWindsor({
    connector: isMeta ? "facebook" : "google_ads",
    fields,
    dateFrom: from,
    dateTo: to,
    accounts: [cfg.account],
    cacheSeconds: 60,
  }).catch(() => [] as WindsorRow[]);

  let currency = "ILS";
  const byCampaign = new Map<string, Agg>();
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const name = String(r.campaign ?? "");
    if (!name.toLowerCase().includes(filter)) continue;
    if (r.currency) currency = String(r.currency).toUpperCase();
    const e = byCampaign.get(name) ?? { spend: 0, impr: 0, clicks: 0, conv: 0 };
    e.spend += num(r.spend);
    e.impr += num(r.impressions);
    e.clicks += num(r.clicks);
    e.conv += isMeta ? sumAction(r[convField]) : num(r[convField]);
    byCampaign.set(name, e);
  }

  const mk = (name: string, e: Agg): PerfCampaign => ({
    name,
    spend: Math.round(e.spend * 100) / 100,
    impressions: Math.round(e.impr),
    clicks: Math.round(e.clicks),
    ctr: e.impr ? e.clicks / e.impr : null,
    cpc: e.clicks ? e.spend / e.clicks : null,
    conv: Math.round(e.conv * 10) / 10,
  });

  const campaigns = [...byCampaign].map(([name, e]) => mk(name, e)).sort((a, b) => b.spend - a.spend);
  const totAgg = [...byCampaign.values()].reduce(
    (a, e) => ({ spend: a.spend + e.spend, impr: a.impr + e.impr, clicks: a.clicks + e.clicks, conv: a.conv + e.conv }),
    { spend: 0, impr: 0, clicks: 0, conv: 0 },
  );

  return {
    key: `${cfg.platform}:${cfg.account}`,
    title: cfg.title,
    platform: cfg.platform,
    currency,
    convLabel: isMeta ? "Leads" : "Conversions",
    campaigns,
    totals: mk("Total", totAgg),
  };
}

export async function getCampaignPerf(brand: BrandConfig, from: string, to: string): Promise<CampaignPerf | null> {
  if (!brand.perfSources?.length) return null;
  const filter = (brand.campaignFilter ?? "").toLowerCase();
  const sources = await Promise.all(brand.perfSources.map((c) => fetchSource(c, filter, from, to)));
  return { sources };
}
