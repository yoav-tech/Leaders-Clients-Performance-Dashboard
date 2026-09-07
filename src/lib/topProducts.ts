// Best-selling products for the e-commerce clients (Argania, La Beaute, Studio Pasha).
//
// Reads the ingested per-day product table so the ranking always covers exactly the range the
// dashboard is showing. See storeProducts.ts for why this is ingested rather than fetched live.
import type { BrandConfig } from "./brands";
import { getStoreTopProducts } from "./storeProducts";

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
  avgPrice: number; // revenue per unit actually realised, i.e. after discounts
}
export interface TopProductsResult {
  rows: TopProduct[];
  period: "range";
  from: string;
  to: string;
  // All products sold in the same range — the share denominator, on the same basis as the rows.
  storeRevenue: number | null;
  distinctProducts: number | null;
}

export async function getTopProducts(brand: BrandConfig, from: string, to: string): Promise<TopProductsResult | null> {
  const r = await getStoreTopProducts(brand, from, to).catch(() => null);
  if (!r || !r.rows.length) return null;
  return {
    rows: r.rows,
    period: "range",
    from: r.from,
    to: r.to,
    storeRevenue: r.storeRevenue,
    distinctProducts: r.distinctProducts,
  };
}
