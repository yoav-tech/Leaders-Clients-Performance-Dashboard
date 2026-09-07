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

export interface TopProduct { name: string; quantity: number; revenue: number }
export interface TopProductsResult {
  rows: TopProduct[];
  period: "range" | "last30d";
  from?: string;
  to?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

// Stores sell the same product under several ids (one per colour or size), which would otherwise
// fill a top-10 with repeats of one name. Merge on the display name the customer actually sees.
function mergeByName(items: TopProduct[], limit = 10): TopProduct[] {
  const m = new Map<string, TopProduct>();
  for (const it of items) {
    const name = it.name.trim();
    if (!name) continue;
    const e = m.get(name) ?? { name, quantity: 0, revenue: 0 };
    e.quantity += it.quantity;
    e.revenue += it.revenue;
    m.set(name, e);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

async function quickshopTop(brand: BrandConfig): Promise<TopProductsResult | null> {
  const key = quickshopKeyFor(brand);
  if (!key) return null;
  const res = await fetch("https://my-quickshop.com/api/v1/analytics", {
    headers: { "X-API-Key": key, Accept: "application/json" },
    next: { revalidate: 1800 },
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json()) as { data?: { top_products?: { name?: string; quantity_sold?: unknown; revenue?: unknown }[] } };
  const raw = j.data?.top_products ?? [];
  if (!raw.length) return null;
  return {
    rows: mergeByName(raw.map((p) => ({ name: String(p.name ?? ""), quantity: num(p.quantity_sold), revenue: num(p.revenue) }))),
    period: "last30d",
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
  const items: TopProduct[] = [];

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
  return { rows: mergeByName(items), period: "range", from, to };
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
