// Direct Google Ads API (GAQL) client — for data Windsor doesn't expose well (confirmed impression
// share, quality score, keyword/search-term metrics, change history). Auth: refresh token → access
// token (cached). Secrets in env: GOOGLE_ADS_DEVELOPER_TOKEN / CLIENT_ID / CLIENT_SECRET /
// REFRESH_TOKEN / LOGIN_CUSTOMER_ID (the MCC). Note: Auction Insights is NOT available via GAQL.

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";

export function googleAdsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN,
  );
}

const digits = (v: string | undefined | null) => String(v ?? "").replace(/[^0-9]/g, "");

// Access token from the long-lived refresh token, cached until ~1 min before expiry.
let _tok: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (_tok && Date.now() < _tok.exp) return _tok.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Google OAuth: no access_token in response");
  _tok = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 };
  return _tok.token;
}

export type GaqlRow = Record<string, Record<string, unknown>>;

// Run a GAQL query against one customer id (hyphens ok — stripped). Returns flattened result rows.
export async function gaql(customerId: string, query: string): Promise<GaqlRow[]> {
  if (!googleAdsConfigured()) throw new Error("Google Ads API not configured (missing env)");
  const token = await accessToken();
  const cid = digits(customerId);
  const login = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      ...(login ? { "login-customer-id": login } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Google Ads ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
  const j = (await res.json()) as Array<{ results?: GaqlRow[] }> | { results?: GaqlRow[] };
  const batches = Array.isArray(j) ? j : [j];
  const rows: GaqlRow[] = [];
  for (const b of batches) for (const r of b.results ?? []) rows.push(r);
  return rows;
}
