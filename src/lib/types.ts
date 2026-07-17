export type Channel = "google" | "meta" | "tiktok" | "site";

// The four ad channels that roll up into "total". "site" is real store revenue and
// is NOT part of ad spend — it drives blended ROAS instead.
export const AD_CHANNELS: Channel[] = ["google", "meta", "tiktok"];

export type Period = "today" | "7d" | "30d" | "mtd";

// One stored row: a brand's metrics for one channel on one day, already normalised to ILS.
export interface DailyMetricRow {
  date: string; // YYYY-MM-DD
  brandId: string;
  channel: Channel;
  spend: number; // native currency
  purchases: number;
  revenue: number; // native currency
  nativeCurrency: string;
  spendIls: number;
  revenueIls: number;
  impressions: number;
  clicks: number;
  newPurchases: number; // site: new-customer orders
  newRevenueIls: number; // site: new-customer revenue (ILS)
}

// Aggregated metrics (ILS) for a channel over a period, with derived ratios.
export interface ChannelMetrics {
  channel: Channel;
  spend: number;
  purchases: number;
  revenue: number;
  impressions: number;
  clicks: number;
  cpa: number | null; // spend / purchases
  roas: number | null; // revenue / spend
  aov: number | null; // revenue / purchases
  ctr: number | null; // clicks / impressions
  cpc: number | null; // spend / clicks
  cpm: number | null; // spend / impressions * 1000
  cvr: number | null; // purchases / clicks
}

// Compact KPI snapshot for period-over-period deltas.
export interface KpiSnapshot {
  spend: number;
  revenue: number; // ad-attributed
  siteRevenue: number;
  roas: number | null;
  blendedRoas: number | null;
  purchases: number;
  cpa: number | null;
  aov: number | null;
  cac: number | null;
}

export interface BrandMetrics {
  brandId: string;
  channels: Record<Channel, ChannelMetrics>;
  total: ChannelMetrics; // sum of ad channels (google + meta + tiktok)
  blendedRoas: number | null; // site revenue / total ad spend
  cac: number | null; // total ad spend / new customers
  newRevenue: number; // store revenue from new customers
  returningRevenue: number; // store revenue from returning customers
  previous: KpiSnapshot | null; // same-length prior period, for deltas
  trend: { date: string; roas: number | null; revenue: number }[];
}

// One day's per-channel metrics for the daily breakdown table.
export interface DayBreakdown {
  date: string;
  channels: Record<Channel, ChannelMetrics>;
  total: ChannelMetrics; // ad channels combined
  blendedRoas: number | null; // site revenue / total ad spend
}
