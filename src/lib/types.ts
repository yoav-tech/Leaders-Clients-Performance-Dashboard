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
}

// Aggregated metrics (ILS) for a channel over a period, with derived ratios.
export interface ChannelMetrics {
  channel: Channel;
  spend: number;
  purchases: number;
  revenue: number;
  cpa: number | null; // spend / purchases
  roas: number | null; // revenue / spend
  aov: number | null; // revenue / purchases
}

export interface BrandMetrics {
  brandId: string;
  channels: Record<Channel, ChannelMetrics>;
  total: ChannelMetrics; // sum of ad channels (google + meta + tiktok)
  blendedRoas: number | null; // site revenue / total ad spend
  trend: { date: string; roas: number | null; revenue: number }[];
}

// One day's per-channel metrics for the brand drill-down modal.
export interface DayBreakdown {
  date: string;
  channels: Record<Channel, ChannelMetrics>;
  total: ChannelMetrics; // ad channels combined
  blendedRoas: number | null; // site revenue / total ad spend
}
