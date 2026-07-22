import { NextResponse } from "next/server";
import { getBrand, type BrandConfig } from "@/lib/brands";
import { CHANNEL_FIELDS } from "@/lib/channelFields";
import { DIMENSION_FIELDS, type Dimension } from "@/lib/breakdowns";
import { fetchWindsor, num } from "@/lib/windsor";
import { fetchQuickShopPaidOrders } from "@/lib/quickshop";
import { fetchShopifyPaidOrders } from "@/lib/shopify";
import { getSupabase, hasDb } from "@/lib/db";
import type { Channel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);

function adAccount(brand: BrandConfig, channel: Channel): string | null {
  if (channel === "google") return brand.googleAccountId;
  if (channel === "meta") return brand.metaAccountId;
  if (channel === "tiktok") return brand.tiktokAccountId;
  return null;
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

    const baseFields = ["account_id", "currency", dimField, "spend", "impressions", "clicks"];
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
      { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; cur: string }
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
      agg.set(key, a);
    }

    const rows = [...agg]
      .map(([key, a]) => {
        const spend = toIls(a.spend, a.cur);
        const revenue = toIls(a.revenue, a.cur);
        return {
          key,
          spend: Math.round(spend),
          impressions: Math.round(a.impressions),
          clicks: Math.round(a.clicks),
          purchases: metricsAvailable ? Math.round(a.purchases * 10) / 10 : null,
          revenue: metricsAvailable ? Math.round(revenue) : null,
          ctr: a.impressions ? a.clicks / a.impressions : null,
          cpc: a.clicks ? spend / a.clicks : null,
          cpm: a.impressions ? (spend / a.impressions) * 1000 : null,
          roas: metricsAvailable && spend ? revenue / spend : null,
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
      storeSummary,
      ...(metricsAvailable ? {} : { note: "Conversions aren't available for this breakdown — showing spend & traffic only." }),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), rows: [] }, { status: 500 });
  }
}
