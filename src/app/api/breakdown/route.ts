import { NextResponse } from "next/server";
import { getBrand, campaignProfileOf, explorerChannels, campaignTargetOf, type BrandConfig } from "@/lib/brands";
import { CHANNEL_FIELDS } from "@/lib/channelFields";
import { DIMENSION_FIELDS, UTM_DIMENSIONS, type Dimension } from "@/lib/breakdowns";
import { campaignFieldFor } from "@/lib/adLevel";
import { fetchWindsor, num } from "@/lib/windsor";
import { fetchQuickShopPaidOrders, type PaidOrder } from "@/lib/quickshop";
import { fetchShopifyPaidOrders } from "@/lib/shopify";
import { getSupabase, hasDb } from "@/lib/db";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import type { Channel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);
// Meta returns some fields as a nested [{action_type, value}] array; sum the values.
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}

// Group paid store orders by utm_campaign (lowercased) → { orders, revenue (ILS) }. Used to
// attribute store revenue to each ad campaign (store utm_campaign == ad campaign id or name).
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
    /* empty attribution on failure */
  }
  return map;
}

function adAccount(brand: BrandConfig, channel: Channel): string | null {
  if (channel === "google") return brand.googleAccountId;
  if (channel === "meta") return brand.metaAccountId;
  if (channel === "tiktok") return brand.tiktokAccountId;
  return null;
}

// Does a store order's utm_source belong to this ad channel? Used to scope the UTM breakdown
// per-channel (Meta tab shows only orders from facebook/instagram/meta sources, etc.).
function channelOwnsSource(channel: Channel, source: string): boolean {
  const s = source.toLowerCase();
  if (!s) return false; // orders with no source aren't attributable to a specific channel
  if (channel === "meta") return s.includes("facebook") || s.includes("instagram") || s.includes("meta") || s === "fb" || s === "ig";
  if (channel === "google") return s.includes("google") || s.includes("adwords") || s === "gads" || s === "gdn";
  if (channel === "tiktok") return s.includes("tiktok") || s === "tt";
  return false;
}

// GET /api/breakdown?brand=&channel=&dimension=&from=&to=  (auth-gated by middleware)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const channel = url.searchParams.get("channel") as Channel;
  const dimension = url.searchParams.get("dimension") as Dimension;
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!brand || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "bad params", rows: [] }, { status: 400 });
  }
  if (!canAccessBrand(await getServerSession(), brand.id)) {
    return NextResponse.json({ error: "forbidden", rows: [] }, { status: 403 });
  }

  try {
    // Store: discount-code breakdown from QuickShop.
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
        .map(([key, v]) => ({
          key,
          orders: v.orders,
          revenue: Math.round(v.revenue),
          discount: Math.round(v.discount),
          aov: v.orders ? Math.round(v.revenue / v.orders) : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 100);
      return NextResponse.json({ kind: "store", channel, dimension, rows });
    }

    // First-party UTM breakdown (source/medium/campaign/content/keyword) from store orders.
    // Available on EVERY channel: on Store it's unscoped; on an ad channel (Meta/Google/TikTok)
    // it's scoped to that channel's own sources, so each tab shows only the orders it drove.
    if (UTM_DIMENSIONS[dimension]) {
      const field = UTM_DIMENSIONS[dimension];
      const isAdChannel = channel === "meta" || channel === "google" || channel === "tiktok";
      const sourceFilter = (url.searchParams.get("source") ?? "").trim().toLowerCase();
      let orders: PaidOrder[] = [];
      if (brand.storePlatform === "shopify") orders = (await fetchShopifyPaidOrders(brand, from, to)).orders;
      else orders = await fetchQuickShopPaidOrders(brand, from, to);

      const sources = new Set<string>();
      const byKey = new Map<string, { orders: number; revenue: number }>();
      for (const o of orders) {
        const src = (o.utmSource ?? "").trim();
        // On an ad channel, keep only orders whose source belongs to this channel.
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
      return NextResponse.json({ kind: "store", channel, dimension, rows, sources: [...sources].sort() });
    }

    // Views / leads brands (SCJ, Style, Leaders, Bestie): the SAME explorer as ecommerce, but
    // with KPI columns per profile. Accounts may be shared (filtered by campaign name).
    const profile = campaignProfileOf(brand);
    if (profile === "views" || profile === "leads") {
      const ch = explorerChannels(brand).find((c) => c.id === channel);
      const dimField = DIMENSION_FIELDS[channel as "google" | "meta" | "tiktok"]?.[dimension];
      if (!ch) return NextResponse.json({ error: "unsupported", rows: [] });
      if (!dimField) return NextResponse.json({ error: "unsupported", rows: [] });
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
            : ["clicks", "conversions"]; // google (+ tiktok fallback)
      const baseFields = [...new Set(["account_id", "currency", "spend", "impressions", campField, dimField])];
      const connector = channel === "meta" ? "facebook" : channel === "tiktok" ? "tiktok" : "google_ads";
      const fetchOpts = {
        connector,
        dateFrom: from,
        dateTo: to,
        accounts: [ch.account],
        ...(channel === "meta" ? { options: { attribution_window: "7d_click,1d_view" } } : {}),
        cacheSeconds: 900,
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

      return NextResponse.json({
        kind: "explorer",
        profile,
        channel,
        dimension,
        target: campaignTargetOf(brand),
        metricsAvailable,
        rows,
        ...(metricsAvailable ? {} : { note: "המדד לא זמין לפילוח הזה — מוצג spend ו-impressions בלבד." }),
      });
    }

    // Ad channels: dimensional breakdown from Windsor.
    const map = CHANNEL_FIELDS[channel as "google" | "meta" | "tiktok"];
    const dimField = DIMENSION_FIELDS[channel as "google" | "meta" | "tiktok"]?.[dimension];
    const account = brand && adAccount(brand, channel);
    if (!map || !dimField) return NextResponse.json({ error: "unsupported", rows: [] });
    if (!account) return NextResponse.json({ error: "no account configured", rows: [] });

    // Meta's "omni" purchase fields can't be segmented by age/gender/country/placement, so
    // breakdown queries use the non-omni pixel fields (they reconcile 1:1 with omni).
    const purchasesField = map.breakdownPurchasesField ?? map.purchasesField;
    const revenueField = map.breakdownRevenueField ?? map.revenueField;
    const valueField = revenueField ?? map.revenueRoasField ?? null;
    const roasField = revenueField ? null : (map.revenueRoasField ?? null);

    // For the campaign dimension we attribute STORE revenue per campaign (matched by the store's
    // utm_campaign to the ad campaign id/name), so fetch campaign_id too.
    const isCampaign = dimension === "campaign";
    const baseFields = ["account_id", "currency", dimField, "spend", "impressions", "clicks", ...(isCampaign ? ["campaign_id"] : [])];
    const fetchOpts = {
      connector: map.connector,
      dateFrom: from,
      dateTo: to,
      accounts: [account],
      options: map.options,
      cacheSeconds: 900, // cache breakdowns 15 min — repeat views are instant
    };

    // Try the full request; if Windsor rejects a value field as incompatible with this
    // breakdown dimension (any channel), fall back to spend/impressions/clicks only.
    let raw;
    let metricsAvailable = true;
    try {
      raw = await fetchWindsor({
        ...fetchOpts,
        fields: [...baseFields, purchasesField, ...(valueField ? [valueField] : [])],
      });
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
    const agg = new Map<
      string,
      { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; cur: string; cid?: string }
    >();
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
      a.revenue += revenueField
        ? num(r[revenueField])
        : roasField
          ? num(r[roasField]) * spend
          : 0;
      a.cur = cur;
      if (isCampaign && r.campaign_id) a.cid = String(r.campaign_id);
      agg.set(key, a);
    }

    // Per-campaign store attribution: group paid store orders by utm_campaign.
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

    // Store-attributed total for this channel (first-party UTM) — the real store outcome, vs
    // the platform-reported per-campaign numbers above.
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

    return NextResponse.json({
      kind: "ad",
      channel,
      dimension,
      rows,
      metricsAvailable,
      storeAttributed: isCampaign,
      storeSummary,
      ...(metricsAvailable ? {} : { note: "Conversions aren't available for this breakdown — showing spend & traffic only." }),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), rows: [] }, { status: 500 });
  }
}
