// Per-day product sales for the store clients, so "top products" matches the report's date range.
//
// PRIVACY: only product name, units and revenue are aggregated per day. No order ids, customer
// fields or addresses are stored or logged — same stance as the daily revenue pipeline.
//
// Why this is ingested rather than read live: QuickShop's order list omits line items and its
// analytics summary is locked to a rolling 30 days, so exact-range figures need one request per
// order. That's ~4 minutes for a month of Argania — fine on a schedule, far too slow on a render.
// Shopify returns line items inline, but it's aggregated the same way so both brands answer from
// one table.
import type { BrandConfig } from "./brands";
import { getSupabase, hasDb } from "./db";
import { quickshopKeyFor } from "./quickshop";
import { shopifyDomainFor, shopifyStaticTokenFor } from "./shopify";
import { localDate } from "./dates";

const QS = "https://my-quickshop.com/api/v1";
const CONCURRENCY = 4; // measured ~950 req/min with no 429s; stays well clear of the limit

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export interface ProductDay { date: string; product: string; quantity: number; revenue: number }

async function getJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(25_000) }).catch(() => null);
    if (!res) { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); continue; }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

// Run jobs with a fixed number of workers, preserving nothing but the side effects.
async function pool<T>(items: T[], workers: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      if (it !== undefined) await fn(it);
    }
  }));
}

async function quickshopLines(brand: BrandConfig, from: string, to: string): Promise<ProductDay[]> {
  const key = quickshopKeyFor(brand);
  if (!key) return [];
  const headers = { "X-API-Key": key, Accept: "application/json" };

  // Widen a day each side: timestamps are UTC and we bucket by Israel-local date.
  const min = from;
  const max = new Date(`${to}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 2);
  const maxStr = max.toISOString().slice(0, 10);

  const orders: { id: string; date: string }[] = [];
  for (let page = 1; page <= 200; page++) {
    const j = (await getJson(`${QS}/orders?created_at_min=${min}&created_at_max=${maxStr}&limit=100&page=${page}`, headers)) as
      | { orders?: unknown[]; data?: unknown[] } | unknown[] | null;
    const arr = (Array.isArray(j) ? j : (j?.orders ?? j?.data ?? [])) as Record<string, unknown>[];
    if (!arr.length) break;
    for (const o of arr) {
      if (String(o.financial_status ?? "") !== "paid") continue;
      const d = localDate(String(o.created_at ?? ""));
      if (d < from || d > to) continue;
      orders.push({ id: String(o.id), date: d });
    }
    if (arr.length < 100) break;
  }

  const agg = new Map<string, ProductDay>();
  await pool(orders, CONCURRENCY, async (o) => {
    const j = (await getJson(`${QS}/orders/${o.id}`, headers)) as Record<string, unknown> | null;
    if (!j) return;
    const d = ((j.order ?? j.data ?? j) as Record<string, unknown>);
    const lines = (d.line_items ?? d.items ?? []) as Record<string, unknown>[];
    for (const li of lines) {
      const product = String(li.name ?? li.title ?? "").trim();
      if (!product) continue;
      const qty = num(li.quantity);
      const revenue = num(li.total) || num(li.price) * qty;
      const k = `${o.date}|${product}`;
      const e = agg.get(k) ?? { date: o.date, product, quantity: 0, revenue: 0 };
      e.quantity += qty;
      e.revenue += revenue;
      agg.set(k, e);
    }
  });
  return [...agg.values()];
}

async function shopifyLines(brand: BrandConfig, from: string, to: string): Promise<ProductDay[]> {
  const token = shopifyStaticTokenFor(brand);
  const domain = shopifyDomainFor(brand);
  if (!token || !domain) return [];
  const params = new URLSearchParams({
    status: "any",
    created_at_min: `${from}T00:00:00+03:00`,
    created_at_max: `${to}T23:59:59+03:00`,
    limit: "250",
    fields: "created_at,financial_status,line_items",
  });
  let url: string | null = `https://${domain}/admin/api/2026-07/orders.json?${params.toString()}`;
  const agg = new Map<string, ProductDay>();

  for (let guard = 0; url && guard < 200; guard++) {
    const res: Response | null = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    }).catch(() => null);
    if (!res?.ok) break;
    const j = (await res.json()) as { orders?: { created_at?: string; financial_status?: string; line_items?: Record<string, unknown>[] }[] };
    for (const o of j.orders ?? []) {
      const st = String(o.financial_status ?? "").toLowerCase();
      if (st !== "paid" && st !== "partially_refunded") continue;
      const d = localDate(String(o.created_at ?? ""));
      if (d < from || d > to) continue;
      for (const li of o.line_items ?? []) {
        const product = String(li.title ?? li.name ?? "").trim();
        if (!product) continue;
        const qty = num(li.quantity);
        const k = `${d}|${product}`;
        const e = agg.get(k) ?? { date: d, product, quantity: 0, revenue: 0 };
        e.quantity += qty;
        e.revenue += num(li.price) * qty - num(li.total_discount);
        agg.set(k, e);
      }
    }
    const link = res.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = next ? next[1] : null;
  }
  return [...agg.values()];
}

// Replace the window wholesale so re-running a range is idempotent and late-settling orders and
// refunds correct themselves rather than double-counting.
export async function ingestStoreProducts(brand: BrandConfig, from: string, to: string): Promise<{ rows: number }> {
  if (!hasDb()) return { rows: 0 };
  const lines = brand.storePlatform === "shopify"
    ? await shopifyLines(brand, from, to)
    : await quickshopLines(brand, from, to);

  const sb = getSupabase();
  const del = await sb.from("store_product_daily").delete().eq("brand_id", brand.id).gte("date", from).lte("date", to);
  if (del.error) throw new Error(del.error.message);
  if (!lines.length) return { rows: 0 };

  for (let i = 0; i < lines.length; i += 500) {
    const chunk = lines.slice(i, i + 500).map((l) => ({
      brand_id: brand.id, date: l.date, product: l.product,
      quantity: Math.round(l.quantity), revenue: Math.round(l.revenue * 100) / 100,
    }));
    const { error } = await sb.from("store_product_daily").upsert(chunk, { onConflict: "brand_id,date,product" });
    if (error) throw new Error(error.message);
  }
  return { rows: lines.length };
}

export interface TopProductRow { name: string; quantity: number; revenue: number; avgPrice: number }
export interface TopProductsFromDb {
  rows: TopProductRow[];
  storeRevenue: number;   // all products in range — the share denominator, same basis as the rows
  distinctProducts: number;
  from: string;
  to: string;
}

export async function getStoreTopProducts(brand: BrandConfig, from: string, to: string, limit = 10): Promise<TopProductsFromDb | null> {
  if (!hasDb()) return null;
  const { data, error } = await getSupabase()
    .from("store_product_daily")
    .select("product,quantity,revenue")
    .eq("brand_id", brand.id)
    .gte("date", from)
    .lte("date", to)
    .limit(50000);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const m = new Map<string, TopProductRow>();
  for (const r of data) {
    const name = String(r.product ?? "").trim();
    if (!name) continue;
    const e = m.get(name) ?? { name, quantity: 0, revenue: 0, avgPrice: 0 };
    e.quantity += num(r.quantity);
    e.revenue += num(r.revenue);
    m.set(name, e);
  }
  const all = [...m.values()].sort((a, b) => b.revenue - a.revenue);
  for (const r of all) r.avgPrice = r.quantity ? r.revenue / r.quantity : 0;
  return {
    rows: all.slice(0, limit),
    storeRevenue: all.reduce((a, r) => a + r.revenue, 0),
    distinctProducts: all.length,
    from,
    to,
  };
}
