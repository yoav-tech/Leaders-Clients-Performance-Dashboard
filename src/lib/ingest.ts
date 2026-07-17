import { getSupabase, hasDb } from "./db";
import { BRANDS, type BrandConfig } from "./brands";
import { CHANNEL_FIELDS } from "./channelFields";
import { fetchUsdIlsRate, toIls } from "./fx";
import { fetchWindsor, num } from "./windsor";
import { fetchQuickShopDaily, quickshopKeyFor } from "./quickshop";
import { today } from "./dates";
import type { Channel } from "./types";

type DailyAgg = { spend: number; purchases: number; revenue: number };
type Sb = ReturnType<typeof getSupabase>;

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

// Windsor REST ignores account-filter params and returns ALL connected accounts for
// a connector, so we filter client-side by account_id. Normalise for comparison
// (Meta may prefix with "act_"; ignore case/whitespace).
function normId(v: unknown): string {
  return String(v ?? "").replace(/^act_/i, "").trim();
}

type WindsorRows = Awaited<ReturnType<typeof fetchWindsor>>;
type ChannelMap = (typeof CHANNEL_FIELDS)[keyof typeof CHANNEL_FIELDS];

// Merge Windsor cost rows (spend + purchases) and value rows (revenue) by date, keeping
// only the target account. Cost and value are fetched separately because Windsor's
// conversion-value pipeline lags its cost pipeline: requesting revenue alongside spend
// drags spend to a stale snapshot. Fetching them apart keeps spend/purchases live.
function buildByDate(
  costRows: WindsorRows,
  valueRows: WindsorRows,
  map: ChannelMap,
  account: string,
): { byDate: Map<string, DailyAgg>; currency: string | null } {
  const target = normId(account);
  const byDate = new Map<string, DailyAgg>();
  let currency: string | null = null;
  const at = (date: string) => {
    let c = byDate.get(date);
    if (!c) {
      c = { spend: 0, purchases: 0, revenue: 0 };
      byDate.set(date, c);
    }
    return c;
  };

  for (const r of costRows) {
    if (normId(r.account_id) !== target) continue;
    const date = String(r.date ?? "").slice(0, 10);
    if (!date) continue;
    if (!currency && r.currency) currency = String(r.currency).toUpperCase();
    const c = at(date);
    c.spend += map.spendField ? num(r[map.spendField]) : 0;
    c.purchases += num(r[map.purchasesField]);
  }
  for (const r of valueRows) {
    if (normId(r.account_id) !== target) continue;
    const date = String(r.date ?? "").slice(0, 10);
    if (!date) continue;
    const c = at(date);
    // Direct revenue field, or derived from a ROAS field (revenue = roas * spend).
    if (map.revenueField) c.revenue += num(r[map.revenueField]);
    else if (map.revenueRoasField) c.revenue += num(r[map.revenueRoasField]) * c.spend;
  }
  return { byDate, currency };
}

// Replace a brand/channel's rows over [from, to] with the freshly fetched aggregates
// (converting native currency to ILS). Delete-then-insert so a channel that now returns
// no data (e.g. an account no longer connected) gets cleared instead of leaving stale rows.
async function replaceDaily(
  sb: Sb,
  brand: BrandConfig,
  channel: Channel,
  from: string,
  to: string,
  byDate: Map<string, DailyAgg>,
  usdIls: number,
  currency: string,
): Promise<number> {
  const del = await sb
    .from("daily_metrics")
    .delete()
    .eq("brand_id", brand.id)
    .eq("channel", channel)
    .gte("date", from)
    .lte("date", to);
  if (del.error) throw new Error(del.error.message);

  const now = new Date().toISOString();
  const rows = Array.from(byDate, ([date, agg]) => ({
    date,
    brand_id: brand.id,
    channel,
    spend: agg.spend,
    purchases: agg.purchases,
    revenue: agg.revenue,
    native_currency: currency,
    spend_ils: toIls(agg.spend, currency, usdIls),
    revenue_ils: toIls(agg.revenue, currency, usdIls),
    fetched_at: now,
  }));
  if (rows.length === 0) return 0;
  const { error } = await sb.from("daily_metrics").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
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
    result.errors.push({ brand: "-", channel: "google", error: "Supabase env not configured" });
    return result;
  }

  const sb = getSupabase();
  const usdIls = await fetchUsdIlsRate();
  result.usdIls = usdIls;
  await sb
    .from("fx_rates")
    .upsert({ date: to, base: "USD", quote: "ILS", rate: usdIls }, { onConflict: "date,base,quote" });

  for (const brand of BRANDS) {
    for (const channel of ["google", "meta", "tiktok", "site"] as Channel[]) {
      // Store channel for QuickShop brands comes from the QuickShop API, not Windsor.
      if (channel === "site" && brand.storePlatform === "quickshop") {
        if (!quickshopKeyFor(brand)) {
          result.skipped.push({ brand: brand.id, channel, reason: "no QuickShop API key" });
          continue;
        }
        try {
          const orders = await fetchQuickShopDaily(brand, from, to);
          const byDate = new Map<string, DailyAgg>();
          for (const [date, agg] of orders) {
            byDate.set(date, { spend: 0, purchases: agg.orders, revenue: agg.revenue });
          }
          result.upserts += await replaceDaily(
            sb,
            brand,
            channel,
            from,
            to,
            byDate,
            usdIls,
            brand.nativeCurrency, // QuickShop store currency
          );
        } catch (e) {
          result.ok = false;
          result.errors.push({
            brand: brand.id,
            channel,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        continue;
      }

      const account = accountForChannel(brand, channel);
      if (!account) {
        result.skipped.push({ brand: brand.id, channel, reason: "no account id configured" });
        continue;
      }
      const map = CHANNEL_FIELDS[channel];
      // Fetch cost (spend + purchases) and value (revenue) separately so spend stays
      // live — Windsor's value pipeline lags its cost pipeline. Request account_id so we
      // can filter client-side (Windsor REST returns all accounts).
      const costFields = ["date", "account_id", "currency", map.purchasesField];
      if (map.spendField) costFields.push(map.spendField);
      const valueField = map.revenueField ?? map.revenueRoasField ?? null;

      try {
        const [costRows, valueRows] = await Promise.all([
          fetchWindsor({
            connector: map.connector,
            fields: costFields,
            dateFrom: from,
            dateTo: to,
            accounts: [account],
            options: map.options,
          }),
          valueField
            ? fetchWindsor({
                connector: map.connector,
                fields: ["date", "account_id", valueField],
                dateFrom: from,
                dateTo: to,
                accounts: [account],
                options: map.options,
              })
            : Promise.resolve([] as WindsorRows),
        ]);
        const { byDate, currency } = buildByDate(costRows, valueRows, map, account);
        // Prefer Windsor's reported account currency; fall back to config.
        const resolved =
          currency ?? brand.channelCurrency?.[channel] ?? brand.nativeCurrency;
        result.upserts += await replaceDaily(sb, brand, channel, from, to, byDate, usdIls, resolved);
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
