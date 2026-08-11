// DB-backed metrics for views/leads brands (SCJ, Style, Leaders, Bestie). Reads daily_metrics
// (the awareness/leads KPI columns) so these clients get the same overview / funnel / trend /
// daily sections as ecommerce — every client is served from the DB.
import { unstable_cache } from "next/cache";
import { getSupabase, hasDb } from "./db";
import { campaignProfileOf, type BrandConfig } from "./brands";
import { shiftDate } from "./dates";

export type Profile = "views" | "leads";

export interface CampChannel {
  channel: "meta" | "google" | "tiktok" | "total";
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  views: number;
  completed: number;
  leads: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpv: number | null;
  cpl: number | null;
  frequency: number | null;
}
export interface CampDay { date: string; spend: number; impressions: number; clicks: number; reach: number; views: number; completed: number; leads: number }
export interface CampBrandMetrics {
  profile: Profile;
  channels: CampChannel[];
  total: CampChannel;
  daily: CampDay[]; // ascending, gap-filled
  previous: { spend: number; impressions: number; clicks: number; reach: number; views: number; leads: number; cpv: number | null; cpl: number | null };
}

interface Raw { date: string; channel: "meta" | "google" | "tiktok"; spend: number; impr: number; clicks: number; reach: number; views: number; completed: number; leads: number }

// Cached like the ecommerce reads (busted on ingest via the "metrics" tag).
const fetchCamp = unstable_cache(_fetchCamp, ["camp-metrics-rows"], { revalidate: 120, tags: ["metrics"] });
async function _fetchCamp(brandId: string, from: string, to: string): Promise<Raw[]> {
  if (!hasDb()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("daily_metrics")
    .select("date,channel,spend_ils,impressions,clicks,reach,views,completed_views,leads")
    .eq("brand_id", brandId)
    .neq("channel", "site")
    .gte("date", from)
    .lte("date", to)
    .limit(20000);
  if (error) throw new Error(`daily_metrics(camp) query failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    date: String(r.date).slice(0, 10),
    channel: r.channel as "meta" | "google" | "tiktok",
    spend: Number(r.spend_ils),
    impr: Number(r.impressions),
    clicks: Number(r.clicks),
    reach: Number(r.reach),
    views: Number(r.views),
    completed: Number(r.completed_views),
    leads: Number(r.leads),
  }));
}

const sum = <T,>(a: T[], f: (t: T) => number) => a.reduce((s, t) => s + (f(t) || 0), 0);

function derive(channel: CampChannel["channel"], r: { spend: number; impr: number; clicks: number; reach: number; views: number; completed: number; leads: number }): CampChannel {
  return {
    channel,
    spend: Math.round(r.spend),
    impressions: Math.round(r.impr),
    clicks: Math.round(r.clicks),
    reach: Math.round(r.reach),
    views: Math.round(r.views),
    completed: Math.round(r.completed),
    leads: Math.round(r.leads * 10) / 10,
    ctr: r.impr ? r.clicks / r.impr : null,
    cpc: r.clicks ? r.spend / r.clicks : null,
    cpm: r.impr ? (r.spend / r.impr) * 1000 : null,
    cpv: r.views ? r.spend / r.views : null,
    cpl: r.leads ? r.spend / r.leads : null,
    frequency: r.reach ? r.impr / r.reach : null,
  };
}
function totalsOf(rows: Raw[]) {
  return { spend: sum(rows, (r) => r.spend), impr: sum(rows, (r) => r.impr), clicks: sum(rows, (r) => r.clicks), reach: sum(rows, (r) => r.reach), views: sum(rows, (r) => r.views), completed: sum(rows, (r) => r.completed), leads: sum(rows, (r) => r.leads) };
}

export async function getCampaignBrandMetrics(brand: BrandConfig, from: string, to: string): Promise<CampBrandMetrics> {
  const profile = campaignProfileOf(brand) === "leads" ? "leads" : "views";
  const len = daysInclusive(from, to);
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(prevTo, -(len - 1));
  const [rows, prevRows] = await Promise.all([fetchCamp(brand.id, from, to), fetchCamp(brand.id, prevFrom, prevTo)]);

  const present = ["meta", "google", "tiktok"].filter((ch) => rows.some((r) => r.channel === ch)) as ("meta" | "google" | "tiktok")[];
  const channels = present.map((ch) => derive(ch, totalsOf(rows.filter((r) => r.channel === ch))));
  const total = derive("total", totalsOf(rows));

  // Daily series (ascending, gap-filled) across all channels.
  const byDate = new Map<string, CampDay>();
  for (const r of rows) {
    let d = byDate.get(r.date);
    if (!d) { d = { date: r.date, spend: 0, impressions: 0, clicks: 0, reach: 0, views: 0, completed: 0, leads: 0 }; byDate.set(r.date, d); }
    d.spend += r.spend; d.impressions += r.impr; d.clicks += r.clicks; d.reach += r.reach; d.views += r.views; d.completed += r.completed; d.leads += r.leads;
  }
  const daily: CampDay[] = [];
  for (let dt = from; dt <= to; dt = shiftDate(dt, 1)) {
    const d = byDate.get(dt);
    daily.push(d ?? { date: dt, spend: 0, impressions: 0, clicks: 0, reach: 0, views: 0, completed: 0, leads: 0 });
  }

  const pt = totalsOf(prevRows);
  return {
    profile,
    channels,
    total,
    daily,
    previous: { spend: Math.round(pt.spend), impressions: Math.round(pt.impr), clicks: Math.round(pt.clicks), reach: Math.round(pt.reach), views: Math.round(pt.views), leads: Math.round(pt.leads * 10) / 10, cpv: pt.views ? pt.spend / pt.views : null, cpl: pt.leads ? pt.spend / pt.leads : null },
  };
}

function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1;
}
