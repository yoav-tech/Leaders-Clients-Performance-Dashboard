// Per-brand period report for the account (client) manager — weekly / monthly. Assembles the
// period's KPIs (with prior-period deltas), top creatives (Meta), and promo/discount performance;
// the narrative conclusions are generated separately (conclusions.ts) from this data.
import { reportGroupOf, type BrandConfig } from "./brands";
import type { BrandMetrics } from "./types";
import { getBrandMetrics } from "./queries";
import { fetchWindsor, num } from "./windsor";
import { toIls } from "./fx";
import { fetchQuickShopPaidOrders } from "./quickshop";
import { fetchShopifyPaidOrders } from "./shopify";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();

export interface TopAd { name: string; spend: number; ctr: number | null; purchases: number; revenue: number; roas: number | null; aov: number | null }
export interface Promo { code: string; orders: number; revenue: number; discount: number }

export interface ManagerReport {
  brandId: string;
  brandName: string;
  isEcom: boolean;
  from: string;
  to: string;
  period: "week" | "month";
  metrics: BrandMetrics | null;
  topAds: TopAd[];
  promos: Promo[];
}

// Top Meta creatives with per-ad spend + Meta-reported conversions (non-omni pixel fields, ILS).
async function topMetaAds(brand: BrandConfig, from: string, to: string): Promise<TopAd[]> {
  if (!brand.metaAccountId) return [];
  try {
    const rows = await fetchWindsor({
      connector: "facebook",
      fields: ["account_id", "currency", "ad_name", "spend", "impressions", "clicks", "actions_purchase", "action_values_purchase"],
      dateFrom: from, dateTo: to, accounts: [brand.metaAccountId], cacheSeconds: 1800,
    });
    const acc = normId(brand.metaAccountId);
    const map = new Map<string, { spend: number; impr: number; clicks: number; purch: number; rev: number }>();
    for (const r of rows) {
      if (normId(r.account_id) !== acc) continue;
      const name = String(r.ad_name ?? "").trim();
      if (!name) continue;
      const cur = String(r.currency ?? "ILS").toUpperCase();
      const e = map.get(name) ?? { spend: 0, impr: 0, clicks: 0, purch: 0, rev: 0 };
      e.spend += toIls(num(r.spend), cur, 3);
      e.impr += num(r.impressions);
      e.clicks += num(r.clicks);
      e.purch += num(r.actions_purchase);
      e.rev += toIls(num(r.action_values_purchase), cur, 3);
      map.set(name, e);
    }
    return [...map]
      .map(([name, e]) => ({
        name,
        spend: Math.round(e.spend),
        ctr: e.impr ? e.clicks / e.impr : null,
        purchases: Math.round(e.purch),
        revenue: Math.round(e.rev),
        roas: e.spend ? e.rev / e.spend : null,
        aov: e.purch ? e.rev / e.purch : null,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function promos(brand: BrandConfig, from: string, to: string): Promise<Promo[]> {
  const byCode = new Map<string, { orders: number; revenue: number; discount: number }>();
  const onOrder = (o: { discountCode: string; total: number; discountAmount: number }) => {
    const code = (o.discountCode || "").trim();
    if (!code) return;
    const e = byCode.get(code) ?? { orders: 0, revenue: 0, discount: 0 };
    e.orders += 1; e.revenue += o.total; e.discount += o.discountAmount;
    byCode.set(code, e);
  };
  try {
    if (brand.storePlatform === "shopify") await fetchShopifyPaidOrders(brand, from, to, onOrder);
    else await fetchQuickShopPaidOrders(brand, from, to, onOrder);
  } catch {
    /* no promos on failure */
  }
  return [...byCode].map(([code, v]) => ({ code, orders: v.orders, revenue: Math.round(v.revenue), discount: Math.round(v.discount) })).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
}

export async function getManagerReport(brand: BrandConfig, from: string, to: string, period: "week" | "month"): Promise<ManagerReport> {
  const [all, topAds, pr] = await Promise.all([
    getBrandMetrics(from, to),
    topMetaAds(brand, from, to),
    promos(brand, from, to),
  ]);
  return { brandId: brand.id, brandName: brand.name, isEcom: reportGroupOf(brand) === "ecommerce", from, to, period, metrics: all.find((m) => m.brandId === brand.id) ?? null, topAds, promos: pr };
}
