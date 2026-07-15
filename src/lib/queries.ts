import { getSupabase, hasDb } from "./db";
import { BRANDS } from "./brands";
import { emptyChannel, withRatios } from "./metrics";
import type {
  BrandMetrics,
  Channel,
  ChannelMetrics,
  DailyMetricRow,
} from "./types";
import { AD_CHANNELS } from "./types";

async function fetchRows(from: string, to: string): Promise<DailyMetricRow[]> {
  if (!hasDb()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("daily_metrics")
    .select("date,brand_id,channel,spend,purchases,revenue,native_currency,spend_ils,revenue_ils")
    .gte("date", from)
    .lte("date", to)
    .limit(20000);
  if (error) throw new Error(`daily_metrics query failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    date: String(r.date).slice(0, 10),
    brandId: r.brand_id as string,
    channel: r.channel as Channel,
    spend: Number(r.spend),
    purchases: Number(r.purchases),
    revenue: Number(r.revenue),
    nativeCurrency: r.native_currency as string,
    spendIls: Number(r.spend_ils),
    revenueIls: Number(r.revenue_ils),
  }));
}

// Build the per-brand aggregate the dashboard renders. All money is ILS.
export async function getBrandMetrics(from: string, to: string): Promise<BrandMetrics[]> {
  const rows = await fetchRows(from, to);

  return BRANDS.map((brand) => {
    const brandRows = rows.filter((r) => r.brandId === brand.id);

    const channels = {} as Record<Channel, ChannelMetrics>;
    for (const ch of ["google", "meta", "tiktok", "site"] as Channel[]) {
      const chRows = brandRows.filter((r) => r.channel === ch);
      const spend = sum(chRows, (r) => r.spendIls);
      const purchases = sum(chRows, (r) => r.purchases);
      const revenue = sum(chRows, (r) => r.revenueIls);
      channels[ch] = chRows.length
        ? withRatios(ch, spend, purchases, revenue)
        : emptyChannel(ch);
    }

    const adRows = brandRows.filter((r) => AD_CHANNELS.includes(r.channel));
    const totalSpend = sum(adRows, (r) => r.spendIls);
    const totalPurchases = sum(adRows, (r) => r.purchases);
    const totalRevenue = sum(adRows, (r) => r.revenueIls);
    const total = withRatios("google", totalSpend, totalPurchases, totalRevenue);

    const blendedRoas = totalSpend ? channels.site.revenue / totalSpend : null;

    return {
      brandId: brand.id,
      channels,
      total: { ...total, channel: "total" as unknown as Channel },
      blendedRoas,
      trend: buildTrend(brandRows, from, to),
    };
  });
}

function buildTrend(rows: DailyMetricRow[], from: string, to: string) {
  const byDate = new Map<string, { spend: number; revenue: number }>();
  for (const r of rows) {
    if (!AD_CHANNELS.includes(r.channel)) continue;
    const cur = byDate.get(r.date) ?? { spend: 0, revenue: 0 };
    cur.spend += r.spendIls;
    cur.revenue += r.revenueIls;
    byDate.set(r.date, cur);
  }
  const out: { date: string; roas: number | null; revenue: number }[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const v = byDate.get(iso);
    out.push({
      date: iso,
      roas: v && v.spend ? v.revenue / v.spend : null,
      revenue: v?.revenue ?? 0,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function sum<T>(items: T[], pick: (t: T) => number): number {
  return items.reduce((acc, it) => acc + (pick(it) || 0), 0);
}

// When the DB was last written (drives the "last updated" label). Null if no DB/data.
export async function getLastUpdated(): Promise<string | null> {
  if (!hasDb()) return null;
  const sb = getSupabase();
  const { data } = await sb
    .from("daily_metrics")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.fetched_at as string) ?? null;
}
