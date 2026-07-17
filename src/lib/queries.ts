import { getSupabase, hasDb } from "./db";
import { BRANDS } from "./brands";
import { monthProgress, shiftDate, today } from "./dates";
import { emptyChannel, withRatios } from "./metrics";
import type {
  BrandMetrics,
  Channel,
  ChannelMetrics,
  DailyMetricRow,
  DayBreakdown,
  KpiSnapshot,
} from "./types";
import { AD_CHANNELS } from "./types";

async function fetchRows(from: string, to: string): Promise<DailyMetricRow[]> {
  if (!hasDb()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("daily_metrics")
    .select(
      "date,brand_id,channel,spend,purchases,revenue,native_currency,spend_ils,revenue_ils,impressions,clicks,new_purchases,new_revenue_ils",
    )
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
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    newPurchases: Number(r.new_purchases),
    newRevenueIls: Number(r.new_revenue_ils),
  }));
}

function daysInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

// Aggregate one brand's rows into per-channel + total metrics, CAC, and new/returning.
function computeBrand(
  rows: DailyMetricRow[],
  brandId: string,
  from: string,
  to: string,
): Omit<BrandMetrics, "previous"> {
  const brandRows = rows.filter((r) => r.brandId === brandId);

  const channels = {} as Record<Channel, ChannelMetrics>;
  for (const ch of ["google", "meta", "tiktok", "site"] as Channel[]) {
    const cr = brandRows.filter((r) => r.channel === ch);
    channels[ch] = cr.length
      ? withRatios(
          ch,
          sum(cr, (r) => r.spendIls),
          sum(cr, (r) => r.purchases),
          sum(cr, (r) => r.revenueIls),
          sum(cr, (r) => r.impressions),
          sum(cr, (r) => r.clicks),
        )
      : emptyChannel(ch);
  }

  const adRows = brandRows.filter((r) => AD_CHANNELS.includes(r.channel));
  const totalSpend = sum(adRows, (r) => r.spendIls);
  const total = withRatios(
    "google",
    totalSpend,
    sum(adRows, (r) => r.purchases),
    sum(adRows, (r) => r.revenueIls),
    sum(adRows, (r) => r.impressions),
    sum(adRows, (r) => r.clicks),
  );

  const siteRows = brandRows.filter((r) => r.channel === "site");
  const siteRevenue = channels.site.revenue;
  const newRevenue = sum(siteRows, (r) => r.newRevenueIls);
  const newCustomers = sum(siteRows, (r) => r.newPurchases);

  return {
    brandId,
    channels,
    total: { ...total, channel: "total" as unknown as Channel },
    blendedRoas: totalSpend ? siteRevenue / totalSpend : null,
    cac: newCustomers ? totalSpend / newCustomers : null,
    newRevenue,
    returningRevenue: Math.max(0, siteRevenue - newRevenue),
    trend: buildTrend(brandRows, from, to),
  };
}

function snapshot(b: Omit<BrandMetrics, "previous">): KpiSnapshot {
  return {
    spend: b.total.spend,
    revenue: b.total.revenue,
    siteRevenue: b.channels.site.revenue,
    siteOrders: b.channels.site.purchases,
    roas: b.total.roas,
    blendedRoas: b.blendedRoas,
    purchases: b.total.purchases,
    cpa: b.total.cpa,
    aov: b.total.aov,
    cac: b.cac,
  };
}

// Build the per-brand aggregate the dashboard renders (with previous-period deltas). ILS.
export async function getBrandMetrics(from: string, to: string): Promise<BrandMetrics[]> {
  const len = daysInclusive(from, to);
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(prevTo, -(len - 1));

  const [rows, prevRows] = await Promise.all([fetchRows(from, to), fetchRows(prevFrom, prevTo)]);

  return BRANDS.map((brand) => {
    const cur = computeBrand(rows, brand.id, from, to);
    const prev = computeBrand(prevRows, brand.id, prevFrom, prevTo);
    return { ...cur, previous: snapshot(prev) };
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

// Per-brand day-by-day breakdown over [from, to] (newest day first). Used by the
// brand drill-down modal. Includes days with no data (shown as zeros).
export async function getDailyBreakdown(
  from: string,
  to: string,
): Promise<Record<string, DayBreakdown[]>> {
  const rows = await fetchRows(from, to);

  // All dates in range, newest first.
  const dates: string[] = [];
  for (let d = to; d >= from; d = shiftDate(d, -1)) dates.push(d);

  const out: Record<string, DayBreakdown[]> = {};
  for (const brand of BRANDS) {
    out[brand.id] = dates.map((date) => {
      const dayRows = rows.filter((r) => r.brandId === brand.id && r.date === date);
      const channels = {} as Record<Channel, ChannelMetrics>;
      for (const ch of ["google", "meta", "tiktok", "site"] as Channel[]) {
        const cr = dayRows.filter((r) => r.channel === ch);
        channels[ch] = cr.length
          ? withRatios(
              ch,
              sum(cr, (r) => r.spendIls),
              sum(cr, (r) => r.purchases),
              sum(cr, (r) => r.revenueIls),
              sum(cr, (r) => r.impressions),
              sum(cr, (r) => r.clicks),
            )
          : emptyChannel(ch);
      }
      const adRows = dayRows.filter((r) => AD_CHANNELS.includes(r.channel));
      const totalSpend = sum(adRows, (r) => r.spendIls);
      const total = withRatios(
        "google",
        totalSpend,
        sum(adRows, (r) => r.purchases),
        sum(adRows, (r) => r.revenueIls),
        sum(adRows, (r) => r.impressions),
        sum(adRows, (r) => r.clicks),
      );
      return {
        date,
        channels,
        total: { ...total, channel: "total" as unknown as Channel },
        blendedRoas: totalSpend ? channels.site.revenue / totalSpend : null,
      };
    });
  }
  return out;
}

// Month-to-date ad spend (ILS) for a brand — for budget pacing (independent of the
// selected date range).
export async function getBrandMonthSpend(brandId: string): Promise<number> {
  const { monthStart } = monthProgress();
  const rows = await fetchRows(monthStart, today());
  return sum(
    rows.filter((r) => r.brandId === brandId && AD_CHANNELS.includes(r.channel)),
    (r) => r.spendIls,
  );
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
