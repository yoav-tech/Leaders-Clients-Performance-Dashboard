// Breakdown-explorer data computation, wrapped in unstable_cache so every warm hit — repeat views,
// tab switches, and other users of the same brand — is instant and shared, instead of re-running the
// slow Windsor + store-order fetches on each request. Auth stays in the route (this is user-agnostic
// data); only the compute is cached. Keyed by (brand, channel, dimension, range, source).

import { unstable_cache } from "next/cache";
import { getBrand, campaignProfileOf, explorerChannels, campaignTargetOf, BRANDS, type BrandConfig } from "./brands";
import { today } from "./dates";
import { CHANNEL_FIELDS } from "./channelFields";
import { DIMENSION_FIELDS, UTM_DIMENSIONS, type Dimension } from "./breakdowns";
import { campaignFieldFor } from "./adLevel";
import { fetchWindsor, num } from "./windsor";
import { fetchQuickShopPaidOrders, type PaidOrder } from "./quickshop";
import { fetchShopifyPaidOrders } from "./shopify";
import { getSupabase, hasDb } from "./db";
import type { Channel } from "./types";

const CACHE_SECONDS = 1800; // Windsor/store fetch TTL — breakdowns don't change intraday, keep hot
const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}

async function fetchStoreByCampaign(brand: BrandConfig, from: string, to: string): Promise<Map<string, { orders: number; revenue: number }>> {
  const map = new Map<string, { orders: number; revenue: number }>();
  const add = (utmCampaign: string | undefined, total: number, cur: string) => {
    const c = (utmCampaign ?? "").trim().toLowerCase();
    if (!c) return;
    const e = map.get(c) ?? { orders: 0, revenue: 0 };
    e.orders += 1;
    e.revenue += toIls(total, cur);
    map.set(c, e);
  };
  try {
    if (brand.storePlatform === "shopify") {
      const { orders, currency } = await fetchShopifyPaidOrders(brand, from, to);
      const cur = (currency ?? brand.nativeCurrency).toUpperCase();
      for (const o of orders) add(o.utmCampaign, o.total, cur);
    } else {
      const orders = await fetchQuickShopPaidOrders(brand, from, to);
      for (const o of orders) add(o.utmCampaign, o.total, brand.nativeCurrency);
    }
  } catch {
  }
  return map;
}

function adAccount(brand: BrandConfig, channel: Channel): string | null {
  if (channel === "google") return brand.googleAccountId;
  if (channel === "meta") return brand.metaAccountId;
  if (channel === "tiktok") return brand.tiktokAccountId;
  return null;
}

function channelOwnsSource(channel: Channel, source: string): boolean {
  const s = source.toLowerCase();
  if (!s) return false;
  if (channel === "meta") return s.includes("facebook") || s.includes("instagram") || s.includes("meta") || s === "fb" || s === "ig";
  if (channel === "google") return s.includes("google") || s.includes("adwords") || s === "gads" || s === "gdn";
  if (channel === "tiktok") return s.includes("tiktok") || s === "tt";
  return false;
}

async function _getBreakdownData(brandId: string, channel: Channel, dimension: Dimension, from: string, to: string, source: string): Promise<Record<string, unknown>> {
  const brand = getBrand(brandId);
  if (!brand) return { error: "bad params", rows: [] };

  if (channel === "site" && dimension === "discount_code") {
    const byCode = new Map<string, { orders: number; revenue: number; discount: number }>();
    const onOrder = (o: { discountCode: string; total: number; discountAmount: number }) => {
      const code = o.discountCode || "(no code)";
      const c = byCode.get(code) ?? { orders: 0, revenue: 0, discount: 0 };
      c.orders += 1;
      c.revenue += o.total;
      c.discount += o.discountAmount;
      byCode.set(code, c);
    };
    if (brand.storePlatform === "shopify") {
      await fetchShopifyPaidOrders(brand, from, to, (o) => onOrder(o));
    } else {
      await fetchQuickShopPaidOrders(brand, from, to, (o) => onOrder(o));
    }
    const rows = [...byCode]
      .map(([key, v]) => ({ key, orders: v.orders, revenue: Math.round(v.revenue), discount: Math.round(v.discount), aov: v.orders ? Math.round(v.revenue / v.orders) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 100);
    return { kind: "store", channel, dimension, rows };
  }

  if (UTM_DIMENSIONS[dimension]) {
    const field = UTM_DIMENSIONS[dimension];
    const isAdChannel = channel === "meta" || channel === "google" || channel === "tiktok";
    const sourceFilter = source.trim().toLowerCase();
    let orders: PaidOrder[] = [];
    if (brand.storePlatform === "shopify") orders = (await fetchShopifyPaidOrders(brand, from, to)).orders;
    else orders = await fetchQuickShopPaidOrders(brand, from, to);

    const sources = new Set<string>();
    const byKey = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      const src = (o.utmSource ?? "").trim();
      if (isAdChannel && !channelOwnsSource(channel, src)) continue;
      if (src) sources.add(src);
      if (sourceFilter && src.toLowerCase() !== sourceFilter) continue;
      const key = (o[field] ?? "").trim() || "(none)";
      const e = byKey.get(key) ?? { orders: 0, revenue: 0 };
      e.orders += 1;
      e.revenue += o.total;
      byKey.set(key, e);
    }
    const rows = [...byKey]
      .map(([key, v]) => ({ key, orders: v.orders, revenue: Math.round(v.revenue), discount: 0, aov: v.orders ? Math.round(v.revenue / v.orders) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 200);
    return { kind: "store", channel, dimension, rows, sources: [...sources].sort() };
  }

  const profile = campaignProfileOf(brand);
  if (profile === "views" || profile === "leads") {
    const ch = explorerChannels(brand).find((c) => c.id === channel);
    const dimField = DIMENSION_FIELDS[channel as "google" | "meta" | "tiktok"]?.[dimension];
    if (!ch) return { error: "unsupported", rows: [] };
    if (!dimField) return { error: "unsupported", rows: [] };
    const campField = campaignFieldFor(channel as "google" | "meta" | "tiktok");

    const metricFields =
      profile === "views"
        ? channel === "meta"
          ? ["reach", "video_thruplay_watched_actions", "video_p100_watched_actions"]
          : channel === "tiktok"
            ? ["reach", "video_watched_2s", "video_watched_6s"]
            : ["video_views"]
        : channel === "meta"
          ? ["clicks", "actions_lead"]
          : ["clicks", "conversions"];
    const baseFields = [...new Set(["account_id", "currency", "spend", "impressions", campField, dimField])];
    const connector = channel === "meta" ? "facebook" : channel === "tiktok" ? "tiktok" : "google_ads";
    const fetchOpts = {
      connector,
      dateFrom: from,
      dateTo: to,
      accounts: [ch.account],
      ...(channel === "meta" ? { options: { attribution_window: "7d_click,1d_view" } } : {}),
      cacheSeconds: CACHE_SECONDS,
    };
    let raw;
    let metricsAvailable = true;
    try {
      raw = await fetchWindsor({ ...fetchOpts, fields: [...baseFields, ...metricFields] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/incompatible|\bomni\b|ranking|invalid/i.test(msg)) {
        raw = await fetchWindsor({ ...fetchOpts, fields: baseFields });
        metricsAvailable = false;
      } else {
        throw e;
      }
    }

    const acc = normId(ch.account);
    type Acc = { spend: number; impr: number; reach: number; clicks: number; views: number; completed: number; leads: number; cur: string };
    const agg = new Map<string, Acc>();
    for (const r of raw) {
      if (normId(r.account_id) !== acc) continue;
      if (ch.filter && !String(r[campField] ?? "").toLowerCase().includes(ch.filter)) continue;
      const key = String(r[dimField] ?? "(none)") || "(none)";
      const cur = String(r.currency ?? brand.nativeCurrency).toUpperCase();
      const a = agg.get(key) ?? { spend: 0, impr: 0, reach: 0, clicks: 0, views: 0, completed: 0, leads: 0, cur };
      a.spend += num(r.spend);
      a.impr += num(r.impressions);
      if (profile === "views") {
        a.reach += num(r.reach);
        if (channel === "meta") { a.views += sumAction(r.video_thruplay_watched_actions); a.completed += sumAction(r.video_p100_watched_actions); }
        else if (channel === "tiktok") { a.views += num(r.video_watched_2s); a.completed += num(r.video_watched_6s); }
        else { a.views += num(r.video_views); }
      } else {
        a.clicks += num(r.clicks);
        a.leads += channel === "meta" ? sumAction(r.actions_lead) : num(r.conversions);
      }
      a.cur = cur;
      agg.set(key, a);
    }

    const rows =
      profile === "views"
        ? [...agg].map(([key, a]) => {
            const spend = toIls(a.spend, a.cur);
            return {
              key,
              spend: Math.round(spend),
              impressions: Math.round(a.impr),
              reach: Math.round(a.reach),
              frequency: a.reach ? a.impr / a.reach : null,
              cpm: a.impr ? (spend / a.impr) * 1000 : null,
              views: metricsAvailable ? Math.round(a.views) : null,
              completedViews: metricsAvailable ? Math.round(a.completed) : null,
              cpv: metricsAvailable && a.views ? spend / a.views : null,
            };
          }).sort((x, y) => y.spend - x.spend).slice(0, 200)
        : [...agg].map(([key, a]) => {
            const spend = toIls(a.spend, a.cur);
            return {
              key,
              spend: Math.round(spend),
              impressions: Math.round(a.impr),
              clicks: Math.round(a.clicks),
              ctr: a.impr ? a.clicks / a.impr : null,
              cpc: a.clicks ? spend / a.clicks : null,
              leads: metricsAvailable ? Math.round(a.leads * 10) / 10 : null,
              cpl: metricsAvailable && a.leads ? spend / a.leads : null,
            };
          }).sort((x, y) => y.spend - x.spend).slice(0, 200);

    return {
      kind: "explorer",
      profile,
      channel,
      dimension,
      target: campaignTargetOf(brand),
      metricsAvailable,
      rows,
      ...(metricsAvailable ? {} : { note: "המדד לא זמין לפילוח הזה — מוצג spend ו-impressions בלבד." }),
    };
  }

  const map = CHANNEL_FIELDS[channel as "google" | "meta" | "tiktok"];
  const dimField = DIMENSION_FIELDS[channel as "google" | "meta" | "tiktok"]?.[dimension];
  const account = adAccount(brand, channel);
  if (!map || !dimField) return { error: "unsupported", rows: [] };
  if (!account) return { error: "no account configured", rows: [] };

  const purchasesField = map.breakdownPurchasesField ?? map.purchasesField;
  const revenueField = map.breakdownRevenueField ?? map.revenueField;
  const valueField = revenueField ?? map.revenueRoasField ?? null;
  const roasField = revenueField ? null : (map.revenueRoasField ?? null);

  const isCampaign = dimension === "campaign";
  const baseFields = ["account_id", "currency", dimField, "spend", "impressions", "clicks", ...(isCampaign ? ["campaign_id"] : [])];
  const fetchOpts = {
    connector: map.connector,
    dateFrom: from,
    dateTo: to,
    accounts: [account],
    options: map.options,
    cacheSeconds: CACHE_SECONDS,
  };

  let raw;
  let metricsAvailable = true;
  try {
    raw = await fetchWindsor({ ...fetchOpts, fields: [...baseFields, purchasesField, ...(valueField ? [valueField] : [])] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/incompatible|\bomni\b|ranking/i.test(msg)) {
      raw = await fetchWindsor({ ...fetchOpts, fields: baseFields });
      metricsAvailable = false;
    } else {
      throw e;
    }
  }

  const target = normId(account);
  const agg = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; cur: string; cid?: string }>();
  for (const r of raw) {
    if (normId(r.account_id) !== target) continue;
    const key = String(r[dimField] ?? "(none)") || "(none)";
    const cur = String(r.currency ?? brand.nativeCurrency).toUpperCase();
    const a = agg.get(key) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, cur };
    const spend = num(r.spend);
    a.spend += spend;
    a.impressions += num(r.impressions);
    a.clicks += num(r.clicks);
    a.purchases += num(r[purchasesField]);
    a.revenue += revenueField ? num(r[revenueField]) : roasField ? num(r[roasField]) * spend : 0;
    a.cur = cur;
    if (isCampaign && r.campaign_id) a.cid = String(r.campaign_id);
    agg.set(key, a);
  }

  const storeByCampaign = isCampaign ? await fetchStoreByCampaign(brand, from, to) : null;

  const rows = [...agg]
    .map(([key, a]) => {
      const spend = toIls(a.spend, a.cur);
      let purchases: number | null;
      let revenue: number | null;
      if (storeByCampaign) {
        const st = storeByCampaign.get(String(a.cid ?? "").toLowerCase()) ?? storeByCampaign.get(key.toLowerCase()) ?? { orders: 0, revenue: 0 };
        purchases = Math.round(st.orders);
        revenue = Math.round(st.revenue);
      } else {
        purchases = metricsAvailable ? Math.round(a.purchases * 10) / 10 : null;
        revenue = metricsAvailable ? Math.round(toIls(a.revenue, a.cur)) : null;
      }
      return {
        key,
        spend: Math.round(spend),
        impressions: Math.round(a.impressions),
        clicks: Math.round(a.clicks),
        purchases,
        revenue,
        aov: purchases && revenue !== null ? Math.round(revenue / purchases) : null,
        ctr: a.impressions ? a.clicks / a.impressions : null,
        cpc: a.clicks ? spend / a.clicks : null,
        cpm: a.impressions ? (spend / a.impressions) * 1000 : null,
        roas: revenue !== null && spend ? revenue / spend : null,
      };
    })
    .sort((x, y) => y.spend - x.spend)
    .slice(0, 200);

  let storeSummary: { orders: number; revenue: number; spend: number; roas: number | null } | null = null;
  if (hasDb()) {
    const sb = getSupabase();
    const [utmRes, metRes] = await Promise.all([
      sb.from("daily_utm").select("purchases,revenue_ils").eq("brand_id", brand.id).eq("channel", channel).gte("date", from).lte("date", to),
      sb.from("daily_metrics").select("spend_ils").eq("brand_id", brand.id).eq("channel", channel).gte("date", from).lte("date", to),
    ]);
    const orders = (utmRes.data ?? []).reduce((s, r) => s + Number(r.purchases), 0);
    const revenue = (utmRes.data ?? []).reduce((s, r) => s + Number(r.revenue_ils), 0);
    const spend = (metRes.data ?? []).reduce((s, r) => s + Number(r.spend_ils), 0);
    storeSummary = { orders: Math.round(orders), revenue: Math.round(revenue), spend: Math.round(spend), roas: spend ? revenue / spend : null };
  }

  return {
    kind: "ad",
    channel,
    dimension,
    rows,
    metricsAvailable,
    storeAttributed: isCampaign,
    storeSummary,
    ...(metricsAvailable ? {} : { note: "Conversions aren't available for this breakdown — showing spend & traffic only." }),
  };
}

// Shared, cross-user cache. from/to are in the key, so each range is cached independently. 30-min
// TTL — breakdown data updates only a few times a day, so mild staleness is fine and keeps it hot.
export const getBreakdownData = unstable_cache(_getBreakdownData, ["breakdown-v2"], { revalidate: 1800, tags: ["breakdown"] });

// Which brands render the breakdown explorer (everyone except platform-plan / app / snapshot /
// media-plan / command-center layouts), and the channel a visitor lands on first.
function explorerBrands(): { brand: BrandConfig; channel: Channel }[] {
  const out: { brand: BrandConfig; channel: Channel }[] = [];
  for (const b of BRANDS) {
    if (b.platformPlan || b.appInstall || b.googleSnapshot || b.commandCenter || b.navHidden) continue;
    const profile = campaignProfileOf(b);
    let channel: Channel | null = null;
    // Profile first: a views/leads brand renders CampaignBrandView (with the explorer) even when it
    // also carries a mediaPlan (e.g. Style). A pure media-plan brand renders MediaPlanView (no explorer).
    if (profile === "views" || profile === "leads") channel = (explorerChannels(b)[0]?.id as Channel) ?? null;
    else if (b.mediaPlan) continue;
    else channel = b.metaAccountId ? "meta" : b.googleAccountId ? "google" : b.tiktokAccountId ? "tiktok" : null;
    if (channel) out.push({ brand: b, channel });
  }
  return out;
}

// Pre-warm the live-Windsor report pages (Haat app + region cost, Chery/Xpeng platform plan) whose
// first render does several slow Windsor pulls, so the first real visitor hits a hot cache. Lazily
// imported to avoid a static cycle. Best-effort.
export async function warmLiveReports(): Promise<{ warmed: number; ms: number }> {
  const start = Date.now();
  const t = today();
  const from = t.slice(0, 8) + "01";
  const [{ getAppReport }, { getRegionCostReport }, { getPlatformPlanExecution }] = await Promise.all([
    import("./appReport"), import("./regionCost"), import("./platformPlan"),
  ]);
  const jobs: Promise<unknown>[] = [];
  for (const b of BRANDS) {
    if (b.appInstall) {
      jobs.push(getAppReport(b, from, t).catch(() => {}));
      jobs.push(getRegionCostReport(b).catch(() => {}));
    }
    if (b.platformPlan) jobs.push(getPlatformPlanExecution(b).catch(() => {}));
  }
  await Promise.all(jobs);
  return { warmed: jobs.length, ms: Date.now() - start };
}

// Pre-warm the landing breakdown (first channel · campaign · this-month) for every explorer brand,
// so the first real visitor hits a hot cache instead of a cold Windsor fetch. Best-effort, limited
// concurrency. Called from the warm cron just under the cache TTL.
export async function warmBreakdowns(): Promise<{ warmed: number; ms: number }> {
  const start = Date.now();
  const t = today();
  const from = t.slice(0, 8) + "01";
  const targets = explorerBrands();
  let warmed = 0;
  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.all(
      targets.slice(i, i + CONCURRENCY).map(async ({ brand, channel }) => {
        try {
          await getBreakdownData(brand.id, channel, "campaign", from, t, "");
          warmed++;
        } catch {
          /* best-effort */
        }
      }),
    );
  }
  return { warmed, ms: Date.now() - start };
}
