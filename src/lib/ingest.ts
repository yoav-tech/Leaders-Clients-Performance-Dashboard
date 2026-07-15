import { getSql, hasDb } from "./db";
import { BRANDS, type BrandConfig } from "./brands";
import { CHANNEL_FIELDS } from "./channelFields";
import { fetchUsdIlsRate, toIls } from "./fx";
import { fetchWindsor, num } from "./windsor";
import { today } from "./dates";
import type { Channel } from "./types";

export interface IngestResult {
  ok: boolean;
  from: string;
  to: string;
  usdIls: number;
  upserts: number;
  skipped: { brand: string; channel: Channel; reason: string }[];
  errors: { brand: string; channel: Channel; error: string }[];
}

function accountForChannel(brand: BrandConfig, channel: Channel): string | null {
  switch (channel) {
    case "google":
      return brand.googleAccountId;
    case "meta":
      return brand.metaAccountId;
    case "tiktok":
      return brand.tiktokAccountId;
    case "site":
      // Only Shopify stores flow through Windsor. QuickShop is ingested separately.
      return brand.storePlatform === "shopify" ? brand.storeId : null;
  }
}

// Aggregate Windsor rows by date into { spend, purchases, revenue }.
function aggregateByDate(
  rows: Awaited<ReturnType<typeof fetchWindsor>>,
  map: (typeof CHANNEL_FIELDS)[keyof typeof CHANNEL_FIELDS],
): Map<string, { spend: number; purchases: number; revenue: number }> {
  const byDate = new Map<string, { spend: number; purchases: number; revenue: number }>();
  for (const r of rows) {
    const date = String(r.date ?? "").slice(0, 10);
    if (!date) continue;
    const cur = byDate.get(date) ?? { spend: 0, purchases: 0, revenue: 0 };
    cur.spend += map.spendField ? num(r[map.spendField]) : 0;
    cur.purchases += num(r[map.purchasesField]);
    cur.revenue += num(r[map.revenueField]);
    byDate.set(date, cur);
  }
  return byDate;
}

export async function runIngest(opts?: { from?: string; to?: string }): Promise<IngestResult> {
  const to = opts?.to ?? today();
  const from = opts?.from ?? to; // default: today only; pass a range to backfill
  const result: IngestResult = {
    ok: true,
    from,
    to,
    usdIls: 0,
    upserts: 0,
    skipped: [],
    errors: [],
  };

  if (!hasDb()) {
    result.ok = false;
    result.errors.push({ brand: "-", channel: "google", error: "No DATABASE_URL configured" });
    return result;
  }

  const sql = getSql();
  const usdIls = await fetchUsdIlsRate();
  result.usdIls = usdIls;
  await sql`
    INSERT INTO fx_rates (date, base, quote, rate)
    VALUES (${to}, 'USD', 'ILS', ${usdIls})
    ON CONFLICT (date, base, quote) DO UPDATE SET rate = EXCLUDED.rate
  `;

  for (const brand of BRANDS) {
    for (const channel of ["google", "meta", "tiktok", "site"] as Channel[]) {
      const account = accountForChannel(brand, channel);
      if (!account) {
        result.skipped.push({ brand: brand.id, channel, reason: "no account id configured" });
        continue;
      }
      const map = CHANNEL_FIELDS[channel];
      const fields = ["date", "account_id", map.purchasesField, map.revenueField];
      if (map.spendField) fields.push(map.spendField);

      try {
        const rows = await fetchWindsor({
          connector: map.connector,
          fields,
          dateFrom: from,
          dateTo: to,
          accounts: [account],
        });
        const byDate = aggregateByDate(rows, map);

        for (const [date, agg] of byDate) {
          const currency = brand.nativeCurrency;
          const spendIls = toIls(agg.spend, currency, usdIls);
          const revenueIls = toIls(agg.revenue, currency, usdIls);
          await sql`
            INSERT INTO daily_metrics
              (date, brand_id, channel, spend, purchases, revenue,
               native_currency, spend_ils, revenue_ils, fetched_at)
            VALUES
              (${date}, ${brand.id}, ${channel}, ${agg.spend}, ${agg.purchases}, ${agg.revenue},
               ${currency}, ${spendIls}, ${revenueIls}, now())
            ON CONFLICT (date, brand_id, channel) DO UPDATE SET
              spend = EXCLUDED.spend,
              purchases = EXCLUDED.purchases,
              revenue = EXCLUDED.revenue,
              native_currency = EXCLUDED.native_currency,
              spend_ils = EXCLUDED.spend_ils,
              revenue_ils = EXCLUDED.revenue_ils,
              fetched_at = now()
          `;
          result.upserts += 1;
        }
      } catch (e) {
        result.ok = false;
        result.errors.push({
          brand: brand.id,
          channel,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return result;
}
