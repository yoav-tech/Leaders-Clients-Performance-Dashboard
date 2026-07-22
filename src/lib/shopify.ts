import type { BrandConfig } from "./brands";
import { localDate, shiftDate } from "./dates";
import type { PaidOrder } from "./quickshop";

// Shopify Admin API connector for the "site" channel (stores read directly via a
// per-store custom-app token instead of through Windsor).
//
// PRIVACY: this reads ONLY created_at, total_price, currency, financial_status, the
// opaque customer id (for new-vs-returning), and discount codes/amounts from each order,
// then immediately aggregates to a daily count + revenue sum. Names, emails, phones and
// addresses are never read, stored, or logged. The database only ever holds daily
// aggregates — no order-level or customer data.

const API_VERSION = "2026-07";
const PAGE_LIMIT = 250; // Admin REST caps page size at 250
const FIELDS =
  "created_at,total_price,currency,financial_status,customer,discount_codes,landing_site,referring_site";

// Pull utm_source/utm_medium from a Shopify landing_site (a path+query like "/?utm_source=ig&…").
function parseUtm(landingSite: string | undefined): { source?: string; medium?: string; campaign?: string } {
  if (!landingSite) return {};
  const qi = landingSite.indexOf("?");
  if (qi < 0) return {};
  const q = new URLSearchParams(landingSite.slice(qi + 1));
  return {
    source: q.get("utm_source") ?? undefined,
    medium: q.get("utm_medium") ?? undefined,
    campaign: q.get("utm_campaign") ?? undefined,
  };
}

// Read a per-brand env var, tolerating hyphen→underscore or removed (LA_BEAUTE / LABEAUTE).
function brandEnv(brand: BrandConfig, prefix: string): string | null {
  const upper = brand.id.toUpperCase();
  return (
    process.env[`${prefix}_${upper.replace(/-/g, "_")}`] ??
    process.env[`${prefix}_${upper.replace(/-/g, "")}`] ??
    null
  );
}

// Legacy static Admin API token (shpat_…) — only for stores still on the old custom-app
// model. Dev-Dashboard apps use client credentials instead (see accessToken below).
export function shopifyStaticTokenFor(brand: BrandConfig): string | null {
  return brandEnv(brand, "SHOPIFY_TOKEN");
}

// Dev-Dashboard client credentials. Exchanged at runtime for a 24h Admin API token.
function shopifyClientFor(brand: BrandConfig): { clientId: string; clientSecret: string } | null {
  const clientId = brandEnv(brand, "SHOPIFY_CLIENT_ID");
  const clientSecret = brandEnv(brand, "SHOPIFY_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

// Cache client-credentials tokens (valid 24h) so we mint at most one per cold start.
const tokenCache = new Map<string, { token: string; exp: number }>();

async function accessToken(brand: BrandConfig): Promise<string> {
  const staticTok = shopifyStaticTokenFor(brand);
  if (staticTok) return staticTok; // legacy custom-app token, if configured

  const client = shopifyClientFor(brand);
  const domain = shopifyDomainFor(brand);
  if (!client || !domain) throw new Error(`Shopify not configured for ${brand.id}`);

  const cached = tokenCache.get(brand.id);
  if (cached && Date.now() < cached.exp - 60_000) return cached.token;

  // Client credentials grant — server-to-server, no OAuth redirect. Requires the store and
  // app to be in the same Shopify organization.
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify token ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error(`Shopify token response missing access_token for ${brand.id}`);
  tokenCache.set(brand.id, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 86399) * 1000 });
  return j.access_token;
}

// myshopify domain — from env (SHOPIFY_DOMAIN_<ID>) or the brand's storeId. Normalised to
// a bare host (no protocol / trailing slash).
export function shopifyDomainFor(brand: BrandConfig): string | null {
  const upper = brand.id.toUpperCase();
  const env =
    process.env[`SHOPIFY_DOMAIN_${upper.replace(/-/g, "_")}`] ??
    process.env[`SHOPIFY_DOMAIN_${upper.replace(/-/g, "")}`];
  const raw = env ?? brand.storeId ?? null;
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
}

export function shopifyConfigured(brand: BrandConfig): boolean {
  const hasCreds = Boolean(shopifyStaticTokenFor(brand) || shopifyClientFor(brand));
  return Boolean(hasCreds && shopifyDomainFor(brand));
}

async function fetchPage(url: string, token: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
      });
      if (res.status === 429) {
        // Rate limited (REST bucket ~2 req/s) — honour Retry-After, else back off.
        const retry = Number(res.headers.get("Retry-After")) || 1;
        await new Promise((r) => setTimeout(r, retry * 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      // Transient network error ("fetch failed") — back off and retry.
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(
    `Shopify request failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// Parse the cursor URL from a Link header: <https://…?page_info=…>; rel="next"
function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/i);
    if (m) return m[1];
  }
  return null;
}

// Returns PAID orders in [from, to] (Israel-local dated), plus the store currency.
// created_at is UTC, so we widen the fetch window by a day on each side and bucket by
// Israel-local date. PII-safe (see file header). Optional onOrder callback exposes the
// discount code/amount for the breakdown explorer.
export async function fetchShopifyPaidOrders(
  brand: BrandConfig,
  from: string,
  to: string,
  onOrder?: (o: { date: string; total: number; discountCode: string; discountAmount: number }) => void,
): Promise<{ orders: PaidOrder[]; currency: string | null }> {
  const domain = shopifyDomainFor(brand);
  if (!domain) throw new Error(`Shopify domain not configured for ${brand.id}`);
  const token = await accessToken(brand);

  const min = `${shiftDate(from, -1)}T00:00:00Z`;
  const max = `${shiftDate(to, 1)}T00:00:00Z`; // widened; filtered to local window below
  const orders: PaidOrder[] = [];
  let currency: string | null = null;

  const params = new URLSearchParams({
    status: "any", // include closed/archived, not just open
    financial_status: "paid",
    created_at_min: min,
    created_at_max: max,
    limit: String(PAGE_LIMIT),
    fields: FIELDS,
  });
  // First request carries the filters; subsequent pages follow the Link header verbatim
  // (Shopify's page_info cursor can't be combined with other filter params).
  let url: string | null = `https://${domain}/admin/api/${API_VERSION}/orders.json?${params.toString()}`;

  for (let guard = 0; url && guard < 5000; guard++) {
    const res = await fetchPage(url, token);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Shopify orders ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      orders?: Array<{
        created_at?: string;
        total_price?: number | string;
        currency?: string;
        financial_status?: string;
        customer?: { id?: number | string } | null;
        discount_codes?: Array<{ code?: string; amount?: number | string }> | null;
        landing_site?: string | null;
        referring_site?: string | null;
      }>;
    };
    for (const o of json.orders ?? []) {
      if (o.financial_status !== "paid") continue;
      if (!o.created_at) continue;
      const d = localDate(o.created_at);
      if (d < from || d > to) continue; // keep only the requested local-date window
      const total = Number(o.total_price ?? 0);
      if (!currency && o.currency) currency = String(o.currency).toUpperCase();
      const utm = parseUtm(o.landing_site ?? undefined);
      orders.push({
        date: d,
        total,
        customerId: String(o.customer?.id ?? ""),
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        referrer: o.referring_site ?? undefined,
      });
      if (onOrder) {
        const codes = o.discount_codes ?? [];
        const discountAmount = codes.reduce((s, c) => s + Number(c.amount ?? 0), 0);
        onOrder({ date: d, total, discountCode: (codes[0]?.code ?? "").trim(), discountAmount });
      }
    }
    url = nextLink(res.headers.get("link") ?? res.headers.get("Link"));
  }

  return { orders, currency };
}
