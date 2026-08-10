import { getSupabase, hasDb } from "./db";
import { BRANDS, campaignProfileOf, explorerChannels, type BrandConfig } from "./brands";
import { CHANNEL_FIELDS } from "./channelFields";
import { campaignFieldFor } from "./adLevel";
import { fetchUsdIlsRate, toIls } from "./fx";
import { fetchWindsor, num } from "./windsor";
import { fetchQuickShopPaidOrders, quickshopKeyFor, type PaidOrder } from "./quickshop";
import { fetchShopifyPaidOrders, shopifyConfigured } from "./shopify";
import { utmToChannel } from "./utmChannel";
import { today } from "./dates";
import type { Channel } from "./types";

type DailyAgg = {
  spend: number;
  purchases: number;
  revenue: number;
  impressions: number;
  clicks: number;
  newPurchases: number; // site channel: new-customer orders
  newRevenue: number; // site channel: new-customer revenue (native currency)
};
type Sb = ReturnType<typeof getSupabase>;

function emptyAgg(): DailyAgg {
  return { spend: 0, purchases: 0, revenue: 0, impressions: 0, clicks: 0, newPurchases: 0, newRevenue: 0 };
}

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

// Meta returns some fields as a nested [{action_type, value}] array; sum the values.
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
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
      c = emptyAgg();
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
    c.impressions += map.impressionsField ? num(r[map.impressionsField]) : 0;
    c.clicks += map.clicksField ? num(r[map.clicksField]) : 0;
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

// Aggregate store paid orders (QuickShop or Shopify) by day and classify new vs returning
// using the persistent store_customers first-seen table (a customer is "new" on their
// first-ever order date). Newly-seen customers are recorded so future runs classify
// correctly. Orders with no customer id (e.g. Shopify without read_customers) count toward
// revenue but never as "new".
async function buildStoreOrdersByDate(sb: Sb, brand: BrandConfig, orders: PaidOrder[]): Promise<Map<string, DailyAgg>> {
  const ids = [...new Set(orders.map((o) => o.customerId).filter(Boolean))];

  // Existing first-seen for these customers (small chunks — long IN() lists blow the GET URL).
  const stored = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const { data, error } = await sb
      .from("store_customers")
      .select("customer_id,first_seen")
      .eq("brand_id", brand.id)
      .in("customer_id", chunk);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) stored.set(r.customer_id as string, String(r.first_seen).slice(0, 10));
  }

  // Earliest order date per customer within this window.
  const windowFirst = new Map<string, string>();
  for (const o of orders) {
    if (!o.customerId) continue;
    const prev = windowFirst.get(o.customerId);
    if (!prev || o.date < prev) windowFirst.set(o.customerId, o.date);
  }

  // First-ever date = min(stored, window-earliest).
  const firstEver = new Map<string, string>();
  for (const id of ids) {
    const s = stored.get(id);
    const w = windowFirst.get(id)!;
    firstEver.set(id, s ? (s < w ? s : w) : w);
  }

  const byDate = new Map<string, DailyAgg>();
  const at = (d: string) => {
    let c = byDate.get(d);
    if (!c) {
      c = emptyAgg();
      byDate.set(d, c);
    }
    return c;
  };
  for (const o of orders) {
    const c = at(o.date);
    c.purchases += 1;
    c.revenue += o.total;
    if (o.customerId && firstEver.get(o.customerId) === o.date) {
      c.newPurchases += 1;
      c.newRevenue += o.total;
    }
  }

  // Record newly-seen customers (keep existing first_seen for known ones).
  const toInsert = ids
    .filter((id) => !stored.has(id))
    .map((id) => ({ brand_id: brand.id, customer_id: id, first_seen: windowFirst.get(id)! }));
  for (let i = 0; i < toInsert.length; i += 400) {
    const chunk = toInsert.slice(i, i + 400);
    if (chunk.length) {
      await sb.from("store_customers").upsert(chunk, { onConflict: "brand_id,customer_id", ignoreDuplicates: true });
    }
  }

  return byDate;
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
    impressions: agg.impressions,
    clicks: agg.clicks,
    new_purchases: agg.newPurchases,
    new_revenue_ils: toIls(agg.newRevenue, currency, usdIls),
    fetched_at: now,
  }));
  if (rows.length === 0) return 0;
  const { error } = await sb.from("daily_metrics").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// Map paid store orders to ad channels via first-party UTM/referrer and store the per-channel,
// per-day attributed purchases + revenue (ILS) in daily_utm. Powers the store-attributed funnel.
async function writeUtmAttribution(
  sb: Sb,
  brand: BrandConfig,
  orders: PaidOrder[],
  from: string,
  to: string,
  usdIls: number,
  currency: string,
): Promise<void> {
  const agg = new Map<string, { purchases: number; revenue: number }>(); // key: `${date}|${channel}`
  for (const o of orders) {
    const ch = utmToChannel(o.utmSource, o.utmMedium, o.referrer);
    if (!ch) continue; // organic/direct/other — not a paid channel
    const key = `${o.date}|${ch}`;
    const a = agg.get(key) ?? { purchases: 0, revenue: 0 };
    a.purchases += 1;
    a.revenue += o.total;
    agg.set(key, a);
  }

  const del = await sb.from("daily_utm").delete().eq("brand_id", brand.id).gte("date", from).lte("date", to);
  if (del.error) throw new Error(del.error.message);

  const now = new Date().toISOString();
  const rows = Array.from(agg, ([key, a]) => {
    const [date, channel] = key.split("|");
    return { date, brand_id: brand.id, channel, purchases: a.purchases, revenue_ils: toIls(a.revenue, currency, usdIls), fetched_at: now };
  });
  if (rows.length) {
    const { error } = await sb.from("daily_utm").insert(rows);
    if (error) throw new Error(error.message);
  }
}

// Aggregate paid store orders by RAW utm_source per day → daily_source. Powers the daily
// table's "by source" filter (finer than channel: catches influencers, SMS, organic, etc).
async function writeSourceAttribution(
  sb: Sb,
  brand: BrandConfig,
  orders: PaidOrder[],
  from: string,
  to: string,
  usdIls: number,
  currency: string,
): Promise<void> {
  const agg = new Map<string, { orders: number; revenue: number }>(); // key: `${date}|${source}`
  for (const o of orders) {
    const source = (o.utmSource ?? "").trim().toLowerCase() || "(none)";
    const key = `${o.date}|${source}`;
    const a = agg.get(key) ?? { orders: 0, revenue: 0 };
    a.orders += 1;
    a.revenue += o.total;
    agg.set(key, a);
  }

  const del = await sb.from("daily_source").delete().eq("brand_id", brand.id).gte("date", from).lte("date", to);
  if (del.error) throw new Error(del.error.message);

  const now = new Date().toISOString();
  const rows = Array.from(agg, ([key, a]) => {
    const i = key.indexOf("|");
    return { date: key.slice(0, i), brand_id: brand.id, source: key.slice(i + 1), orders: a.orders, revenue_ils: toIls(a.revenue, currency, usdIls), fetched_at: now };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (chunk.length) {
      const { error } = await sb.from("daily_source").insert(chunk);
      if (error) throw new Error(error.message);
    }
  }
}

// Non-ecommerce accumulator (awareness reach/views, leads, app installs, or search conversions),
// per day, per channel.
type CampAgg = { spend: number; impr: number; clicks: number; reach: number; views: number; completed: number; leads: number; installs: number; purchases: number };
function emptyCamp(): CampAgg {
  return { spend: 0, impr: 0, clicks: 0, reach: 0, views: 0, completed: 0, leads: 0, installs: 0, purchases: 0 };
}

// Replace a non-ecommerce brand-channel's daily_metrics rows over [from, to] with fresh
// aggregates. revenue stays 0; the KPI columns (reach/views/leads/installs/purchases) carry it.
async function replaceCampaignDaily(sb: Sb, brand: BrandConfig, channel: Channel, from: string, to: string, byDate: Map<string, CampAgg>, usdIls: number, currency: string): Promise<number> {
  const del = await sb.from("daily_metrics").delete().eq("brand_id", brand.id).eq("channel", channel).gte("date", from).lte("date", to);
  if (del.error) throw new Error(del.error.message);
  const now = new Date().toISOString();
  const rows = Array.from(byDate, ([date, a]) => ({
    date, brand_id: brand.id, channel,
    spend: a.spend, purchases: a.purchases, revenue: 0, native_currency: currency,
    spend_ils: toIls(a.spend, currency, usdIls), revenue_ils: 0,
    impressions: a.impr, clicks: a.clicks,
    reach: a.reach, views: a.views, completed_views: a.completed, leads: a.leads, installs: a.installs,
    new_purchases: 0, new_revenue_ils: 0, fetched_at: now,
  }));
  if (rows.length === 0) return 0;
  const { error } = await sb.from("daily_metrics").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// Ingest a views/leads brand: each explorer channel (a Windsor account + campaign-name filter),
// per-day awareness/leads metrics → daily_metrics. Shared accounts are filtered by campaign name.
async function ingestCampaignBrand(sb: Sb, brand: BrandConfig, from: string, to: string, usdIls: number, result: IngestResult): Promise<void> {
  const profile = campaignProfileOf(brand); // "views" | "leads"
  for (const ch of explorerChannels(brand)) {
    const connector = ch.id === "meta" ? "facebook" : ch.id === "tiktok" ? "tiktok" : "google_ads";
    const campField = campaignFieldFor(ch.id);
    const metricFields =
      profile === "views"
        ? ch.id === "meta"
          ? ["reach", "video_thruplay_watched_actions", "video_p100_watched_actions"]
          : ch.id === "tiktok"
            ? ["reach", "video_watched_2s", "video_watched_6s"]
            : ["video_views"]
        : ch.id === "meta"
          ? ["actions_lead"]
          : ["conversions"];
    const fields = [...new Set(["date", "account_id", "currency", campField, "spend", "impressions", "clicks", ...metricFields])];
    try {
      const rows = await fetchWindsor({
        connector,
        fields,
        dateFrom: from,
        dateTo: to,
        accounts: [ch.account],
        ...(ch.id === "meta" ? { options: { attribution_window: "7d_click,1d_view" } } : {}),
      });
      const acc = normId(ch.account);
      const byDate = new Map<string, CampAgg>();
      let currency = brand.nativeCurrency as string;
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        if (ch.filter && !String(r[campField] ?? "").toLowerCase().includes(ch.filter)) continue;
        const date = String(r.date ?? "").slice(0, 10);
        if (!date) continue;
        if (r.currency) currency = String(r.currency).toUpperCase();
        let a = byDate.get(date);
        if (!a) { a = emptyCamp(); byDate.set(date, a); }
        a.spend += num(r.spend);
        a.impr += num(r.impressions);
        a.clicks += num(r.clicks);
        if (profile === "views") {
          a.reach += num(r.reach);
          if (ch.id === "meta") { a.views += sumAction(r.video_thruplay_watched_actions); a.completed += sumAction(r.video_p100_watched_actions); }
          else if (ch.id === "tiktok") { a.views += num(r.video_watched_2s); a.completed += num(r.video_watched_6s); }
          else { a.views += num(r.video_views); }
        } else {
          a.leads += ch.id === "meta" ? sumAction(r.actions_lead) : num(r.conversions);
        }
      }
      result.upserts += await replaceCampaignDaily(sb, brand, ch.id, from, to, byDate, usdIls, currency);
    } catch (e) {
      result.ok = false;
      result.errors.push({ brand: brand.id, channel: ch.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

// Ingest an app brand (Haat): each appSection is a Meta account (delivery installs + HR leads).
// Both sections merge into one daily meta row (spend/impr/clicks summed; installs from the app
// section, leads from the leads section). The detailed section view stays live — this is the DB copy.
async function ingestAppBrand(sb: Sb, brand: BrandConfig, from: string, to: string, usdIls: number, result: IngestResult): Promise<void> {
  const sections = brand.appSections ?? [];
  const byDate = new Map<string, CampAgg>();
  let currency = brand.nativeCurrency as string;
  try {
    for (const sec of sections) {
      const convField = sec.kind === "app" ? "actions_mobile_app_install" : "actions_lead";
      const rows = await fetchWindsor({
        connector: "facebook",
        fields: ["date", "account_id", "currency", "spend", "impressions", "clicks", convField],
        dateFrom: from, dateTo: to, accounts: [sec.account], options: { attribution_window: "7d_click,1d_view" },
      });
      const acc = normId(sec.account);
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        const date = String(r.date ?? "").slice(0, 10);
        if (!date) continue;
        if (r.currency) currency = String(r.currency).toUpperCase();
        let a = byDate.get(date);
        if (!a) { a = emptyCamp(); byDate.set(date, a); }
        a.spend += num(r.spend);
        a.impr += num(r.impressions);
        a.clicks += num(r.clicks);
        if (sec.kind === "app") a.installs += sumAction(r.actions_mobile_app_install);
        else a.leads += sumAction(r.actions_lead);
      }
    }
    result.upserts += await replaceCampaignDaily(sb, brand, "meta", from, to, byDate, usdIls, currency);
  } catch (e) {
    result.ok = false;
    result.errors.push({ brand: brand.id, channel: "meta", error: e instanceof Error ? e.message : String(e) });
  }
}

// Ingest an impression-share brand (Colgate): sum the Google snapshot accounts into one daily
// google row (spend/impr/clicks + search conversions → purchases). The competitive impression-
// share view stays live (IS is a rate, computed there) — this is the DB copy of the additive data.
async function ingestImpshareBrand(sb: Sb, brand: BrandConfig, from: string, to: string, usdIls: number, result: IngestResult): Promise<void> {
  const accounts = brand.googleSnapshot ?? [];
  const byDate = new Map<string, CampAgg>();
  let currency = "EUR"; // Colgate's Google accounts bill in EUR; overridden by the row's currency
  try {
    for (const g of accounts) {
      const rows = await fetchWindsor({
        connector: "google_ads",
        fields: ["date", "account_id", "currency", "spend", "impressions", "clicks", "conversions"],
        dateFrom: from, dateTo: to, accounts: [g.account],
      });
      const acc = normId(g.account);
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        const date = String(r.date ?? "").slice(0, 10);
        if (!date) continue;
        if (r.currency) currency = String(r.currency).toUpperCase();
        let a = byDate.get(date);
        if (!a) { a = emptyCamp(); byDate.set(date, a); }
        a.spend += num(r.spend);
        a.impr += num(r.impressions);
        a.clicks += num(r.clicks);
        a.purchases += num(r.conversions);
      }
    }
    result.upserts += await replaceCampaignDaily(sb, brand, "google", from, to, byDate, usdIls, currency);
  } catch (e) {
    result.ok = false;
    result.errors.push({ brand: brand.id, channel: "google", error: e instanceof Error ? e.message : String(e) });
  }
}

export async function runIngest(opts?: { from?: string; to?: string; brandId?: string }): Promise<IngestResult> {
  const to = opts?.to ?? today();
  const from = opts?.from ?? to; // default: today only; pass a range to backfill
  const brandFilter = opts?.brandId; // optional: ingest a single brand (on-demand live refresh)
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
    if (brandFilter && brand.id !== brandFilter) continue;

    // Views/leads brands (SCJ, Style, Leaders, Bestie): shared accounts + campaign filter, KPI
    // columns (reach/views/leads). Ingested via their own path so every client persists to the DB.
    const profile = campaignProfileOf(brand);
    if (profile === "views" || profile === "leads") {
      await ingestCampaignBrand(sb, brand, from, to, usdIls, result);
      continue;
    }
    if (profile === "app") {
      await ingestAppBrand(sb, brand, from, to, usdIls, result);
      continue;
    }
    if (profile === "impshare") {
      await ingestImpshareBrand(sb, brand, from, to, usdIls, result);
      continue;
    }

    for (const channel of ["google", "meta", "tiktok", "site"] as Channel[]) {
      // Store channel for QuickShop brands comes from the QuickShop API, not Windsor.
      if (channel === "site" && brand.storePlatform === "quickshop") {
        if (!quickshopKeyFor(brand)) {
          result.skipped.push({ brand: brand.id, channel, reason: "no QuickShop API key" });
          continue;
        }
        try {
          const orders = await fetchQuickShopPaidOrders(brand, from, to);
          const byDate = await buildStoreOrdersByDate(sb, brand, orders);
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
          await writeUtmAttribution(sb, brand, orders, from, to, usdIls, brand.nativeCurrency);
          await writeSourceAttribution(sb, brand, orders, from, to, usdIls, brand.nativeCurrency);
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

      // Shopify stores: read directly via the Admin API when a Dev-Dashboard client (or
      // legacy token) is configured; otherwise fall through to the Windsor connector below.
      if (channel === "site" && brand.storePlatform === "shopify" && shopifyConfigured(brand)) {
        try {
          const { orders, currency } = await fetchShopifyPaidOrders(brand, from, to);
          const byDate = await buildStoreOrdersByDate(sb, brand, orders);
          const storeCurrency = currency ?? brand.channelCurrency?.site ?? brand.nativeCurrency;
          result.upserts += await replaceDaily(sb, brand, channel, from, to, byDate, usdIls, storeCurrency);
          await writeUtmAttribution(sb, brand, orders, from, to, usdIls, storeCurrency);
          await writeSourceAttribution(sb, brand, orders, from, to, usdIls, storeCurrency);
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
      if (map.impressionsField) costFields.push(map.impressionsField);
      if (map.clicksField) costFields.push(map.clicksField);
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
