// Best-selling products for the e-commerce clients (Argania, La Beaute, Studio Pasha).
//
// The two store platforms expose this very differently, so the period each brand can report on
// differs — and the panel says which one it is rather than implying they match:
//   • Shopify  — order line items are date-filterable, so we aggregate the report's exact range.
//   • QuickShop — no per-range product endpoint. Its /analytics summary carries a ready-made
//     top-products list over a fixed rolling 30 days. Pulling exact-range figures would mean one
//     request per order (the list endpoint omits line items), which the rate limit makes far too
//     slow for a page render.
import { unstable_cache } from "next/cache";
import type { BrandConfig } from "./brands";
import { quickshopKeyFor } from "./quickshop";
import { shopifyDomainFor, shopifyStaticTokenFor } from "./shopify";

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
  avgPrice: number; // revenue per unit actually realised, i.e. after discounts
}
export interface TopProductsResult {
  rows: TopProduct[];
  period: "range" | "last30d";
  from?: string;
  to?: string;
  // Store revenue on the SAME basis as the product rows, so shares are of the whole store. Null
  // when the platform can't give us a comparable figure — QuickShop's order revenue is netted
  // differently from its product revenue, and using it produced shares over 100%. When null the
  // panel falls back to sharing out the top-N subtotal and says so.
  storeRevenue: number | null;
  distinctProducts: number | null; // products sold in the period (Shopify) or active (QuickShop)
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

// Stores sell the same product under several ids (one per colour or size), which would otherwise
// fill a top-10 with repeats of one name. Merge on the display name the customer actually sees.
function mergeByName(items: { name: string; quantity: number; revenue: number }[]): TopProduct[] {
  const m = new Map<string, TopProduct>();
  for (const it of items) {
    const name = it.name.trim();
    if (!name) continue;
    const e = m.get(name) ?? { name, quantity: 0, revenue: 0, avgPrice: 0 };
    e.quantity += it.quantity;
    e.revenue += it.revenue;
    m.set(name, e);
  }
  const rows = [...m.values()].sort((a, b) => b.revenue - a.revenue);
  for (const r of rows) r.avgPrice = r.quantity ? r.revenue / r.quantity : 0;
  return rows;
}

async function quickshopTop(brand: BrandConfig): Promise<TopProductsResult | null> {
  const key = quickshopKeyFor(brand);
  if (!key) return null;
  const res = await fetch("https://my-quickshop.com/api/v1/analytics", {
    headers: { "X-API-Key": key, Accept: "application/json" },
    next: { revalidate: 1800 },
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json()) as {
    data?: {
      top_products?: { name?: string; quantity_sold?: unknown; revenue?: unknown }[];
      orders?: { revenue?: unknown };
      products?: { active?: unknown };
    };
  };
  const raw = j.data?.top_products ?? [];
  if (!raw.length) return null;
  return {
    rows: mergeByName(raw.map((p) => ({ name: String(p.name ?? ""), quantity: num(p.quantity_sold), revenue: num(p.revenue) }))).slice(0, 10),
    period: "last30d",
    // Deliberately null: /analytics orders.revenue is netted (discounts/refunds/status) while
    // top_products.revenue is gross line revenue, so the top ten can exceed it. Not comparable.
    storeRevenue: null,
    distinctProducts: num(j.data?.products?.active) || null,
  };
}

interface ShopifyLine { title?: string; name?: string; quantity?: unknown; price?: unknown; total_discount?: unknown }

async function shopifyTop(brand: BrandConfig, from: string, to: string): Promise<TopProductsResult | null> {
  const token = shopifyStaticTokenFor(brand);
  const domain = shopifyDomainFor(brand);
  if (!token || !domain) return null;

  // Widen a day each side (timestamps are UTC, the report is Israel-local) — close enough for a
  // "what sold best" ranking, which is about order not exact revenue attribution.
  const params = new URLSearchParams({
    status: "any",
    created_at_min: `${from}T00:00:00+03:00`,
    created_at_max: `${to}T23:59:59+03:00`,
    limit: "250",
    fields: "financial_status,line_items",
  });
  let url: string | null = `https://${domain}/admin/api/2026-07/orders.json?${params.toString()}`;
  // Raw lines; avgPrice is derived once they're merged by product name.
  const items: { name: string; quantity: number; revenue: number }[] = [];

  for (let guard = 0; url && guard < 60; guard++) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { orders?: { financial_status?: string; line_items?: ShopifyLine[] }[] };
    for (const o of j.orders ?? []) {
      const st = String(o.financial_status ?? "").toLowerCase();
      if (st !== "paid" && st !== "partially_refunded") continue;
      for (const li of o.line_items ?? []) {
        const qty = num(li.quantity);
        items.push({
          name: String(li.title ?? li.name ?? ""),
          quantity: qty,
          revenue: num(li.price) * qty - num(li.total_discount),
        });
      }
    }
    const link = res.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = next ? next[1] : null;
  }

  if (!items.length) return null;
  const all = mergeByName(items); // every product sold in the range, ranked
  return {
    rows: all.slice(0, 10),
    period: "range",
    from,
    to,
    storeRevenue: all.reduce((a, r) => a + r.revenue, 0),
    distinctProducts: all.length,
  };
}

const _get = async (brandJson: string, from: string, to: string): Promise<TopProductsResult | null> => {
  const brand = JSON.parse(brandJson) as BrandConfig;
  if (brand.storePlatform === "shopify") return shopifyTop(brand, from, to).catch(() => null);
  return quickshopTop(brand).catch(() => null);
};

const cached = unstable_cache(_get, ["top-products-v1"], { revalidate: 1800, tags: ["top-products"] });

export async function getTopProducts(brand: BrandConfig, from: string, to: string): Promise<TopProductsResult | null> {
  return cached(JSON.stringify(brand), from, to);
}
