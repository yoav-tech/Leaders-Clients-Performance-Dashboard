import type { BrandConfig } from "./brands";
import { quickshopKeyFor } from "./quickshop";

// QuickShop /analytics is a fixed rolling-30-day summary (not date-filterable), so we
// surface it as a labelled "last 30 days" snapshot on the store card. Fetched live,
// server-side, cached 30 min (no per-render hammering, no DB table needed).

export interface StoreAnalytics {
  revenue30d: number;
  orders30d: number;
  aov: number;
  cancelled: number;
  newCustomers: number;
  revenueGrowthPct: number | null;
  ordersGrowthPct: number | null;
  topProducts: { name: string; revenue: number; quantitySold: number }[];
}

export async function fetchQuickShopAnalytics(brand: BrandConfig): Promise<StoreAnalytics | null> {
  const key = quickshopKeyFor(brand);
  if (!key) return null;
  try {
    const res = await fetch("https://my-quickshop.com/api/v1/analytics", {
      headers: { "X-API-Key": key, Accept: "application/json" },
      next: { revalidate: 1800 }, // cache 30 min
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: QuickShopAnalyticsData };
    const d = j.data;
    if (!d) return null;
    return {
      revenue30d: num(d.orders?.revenue),
      orders30d: num(d.orders?.total),
      aov: num(d.orders?.average_order_value),
      cancelled: num(d.orders?.cancelled),
      newCustomers: num(d.customers?.new_in_period),
      revenueGrowthPct: d.orders?.growth?.revenue_percent ?? null,
      ordersGrowthPct: d.orders?.growth?.orders_percent ?? null,
      topProducts: (d.top_products ?? []).slice(0, 3).map((p) => ({
        name: p.name,
        revenue: num(p.revenue),
        quantitySold: num(p.quantity_sold),
      })),
    };
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

interface QuickShopAnalyticsData {
  orders?: {
    total?: number;
    revenue?: number;
    average_order_value?: number;
    cancelled?: number;
    growth?: { revenue_percent?: number; orders_percent?: number };
  };
  customers?: { new_in_period?: number };
  top_products?: { name: string; revenue?: number; quantity_sold?: number }[];
}
