import type { BrandConfig } from "./brands";
import { localDate, shiftDate } from "./dates";

// QuickShop store connector for the "site" channel.
//
// PRIVACY: this reads ONLY created_at, total and financial_status from each order and
// immediately aggregates to a daily count + revenue sum. Customer names, emails, phones,
// addresses and any other order fields are never read, stored, or logged. The database
// only ever holds daily aggregates — no order-level or customer data.

const BASE = "https://my-quickshop.com/api/v1";
const PAGE_LIMIT = 100; // API caps page size at 100

export interface PaidOrder {
  date: string; // Israel-local YYYY-MM-DD
  total: number; // native store currency
  customerId: string; // opaque store id (not PII) — for new-vs-returning classification
  utmSource?: string; // first-party attribution — for store-attributed channel funnels
  utmMedium?: string;
  utmCampaign?: string; // for per-campaign store attribution (matches ad campaign id/name)
  referrer?: string; // Shopify referring_site host (fallback attribution)
}

// Per-brand API key. Accepts both QUICKSHOP_API_KEY_STUDIO_PASHA and
// QUICKSHOP_API_KEY_STUDIOPASHA (hyphen → underscore, or removed).
export function quickshopKeyFor(brand: BrandConfig): string | null {
  const upper = brand.id.toUpperCase();
  const withUnderscore = `QUICKSHOP_API_KEY_${upper.replace(/-/g, "_")}`;
  const noSeparator = `QUICKSHOP_API_KEY_${upper.replace(/-/g, "")}`;
  return process.env[withUnderscore] ?? process.env[noSeparator] ?? null;
}

async function fetchPage(url: string, key: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { "X-API-Key": key, Accept: "application/json" } });
      if (res.status === 429) {
        // Rate limited (100 req/min) — back off and retry.
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      // Transient network error ("fetch failed") — back off and retry.
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`QuickShop request failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// Returns PAID orders in [from, to] (Israel-local dated). created_at_max is exclusive at
// midnight; timestamps are UTC, so we widen the fetch window by a day on each side and
// bucket by Israel-local date. PII-safe: reads only created_at, total, financial_status,
// customer_id (opaque). Optionally include discount fields for the breakdown explorer.
export async function fetchQuickShopPaidOrders(
  brand: BrandConfig,
  from: string,
  to: string,
  onOrder?: (o: { date: string; total: number; discountCode: string; discountAmount: number }) => void,
): Promise<PaidOrder[]> {
  const key = quickshopKeyFor(brand);
  if (!key) throw new Error(`No QuickShop API key configured for ${brand.id}`);

  const min = shiftDate(from, -1);
  const max = shiftDate(to, 1); // exclusive upper bound
  const out: PaidOrder[] = [];

  let page = 1;
  for (;;) {
    const url = `${BASE}/orders?created_at_min=${min}&created_at_max=${max}&limit=${PAGE_LIMIT}&page=${page}`;
    const res = await fetchPage(url, key);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`QuickShop orders ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: Array<{
        created_at?: string;
        total?: number | string;
        financial_status?: string;
        customer_id?: string;
        discount_code?: string | null;
        discount_amount?: number | string | null;
        utm_source?: string | null;
        utm_medium?: string | null;
        utm_campaign?: string | null;
      }>;
      meta?: { pagination?: { has_next?: boolean } };
    };
    for (const o of json.data ?? []) {
      if (o.financial_status !== "paid") continue; // paid/completed only
      if (!o.created_at) continue;
      const d = localDate(o.created_at);
      if (d < from || d > to) continue; // keep only the requested local-date window
      const total = Number(o.total ?? 0);
      out.push({
        date: d,
        total,
        customerId: String(o.customer_id ?? ""),
        utmSource: o.utm_source ?? undefined,
        utmMedium: o.utm_medium ?? undefined,
        utmCampaign: o.utm_campaign ?? undefined,
      });
      onOrder?.({
        date: d,
        total,
        discountCode: (o.discount_code ?? "").trim(),
        discountAmount: Number(o.discount_amount ?? 0),
      });
    }
    if (!json.meta?.pagination?.has_next) break;
    page += 1;
    if (page > 5000) break; // safety backstop
  }
  return out;
}
