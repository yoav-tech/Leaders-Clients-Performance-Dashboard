// Thin client for the Windsor.ai REST API.
// Docs pattern: https://connectors.windsor.ai/<connector>?api_key=...&date_from=...&date_to=...&fields=...
// The response is JSON: { data: [ { <field>: <value>, ... } ] }

const BASE = "https://connectors.windsor.ai";
// Bound every call: several run in parallel per page, so worst case stays far under the 120s
// function limit even when Windsor is unreachable.
const WINDSOR_TIMEOUT_MS = 20_000;
const WINDSOR_ATTEMPTS = 2;

export interface WindsorQuery {
  connector: string; // e.g. "google_ads", "facebook", "tiktok", "shopify"
  fields: string[]; // field IDs (from get_fields)
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  accounts?: string[]; // optional account-id filter
  options?: Record<string, string>; // connector options, e.g. { attribution_window: "7d_click,1d_view" }
  cacheSeconds?: number; // Next Data Cache revalidate (breakdown reads); omit for live ingest
}

export type WindsorRow = Record<string, string | number | null>;

export async function fetchWindsor(q: WindsorQuery): Promise<WindsorRow[]> {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY is not set");

  const params = new URLSearchParams({
    api_key: apiKey,
    date_from: q.dateFrom,
    date_to: q.dateTo,
    fields: q.fields.join(","),
    _renderer: "json",
  });
  if (q.accounts?.length) params.set("accounts", q.accounts.join(","));
  // Connector options (e.g. attribution_window) are passed as plain query params.
  for (const [k, v] of Object.entries(q.options ?? {})) params.set(k, v);

  const url = `${BASE}/${q.connector}?${params.toString()}`;

  // Windsor intermittently hangs on connect from Vercel (ETIMEDOUT / ECONNRESET). Without a bound
  // the socket never settles, so callers' .catch() never runs and the whole request burns the
  // 120s function limit — the page just dies. A timeout turns a hang into a normal error that
  // callers already degrade from, and one retry covers the transient resets.
  let lastErr: unknown;
  for (let attempt = 0; attempt < WINDSOR_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
    let fatal: Error | null = null;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(WINDSOR_TIMEOUT_MS),
        ...(q.cacheSeconds ? { next: { revalidate: q.cacheSeconds } } : {}),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`Windsor ${q.connector} ${res.status}: ${body.slice(0, 300)}`);
        // A 4xx is a bad request — retrying won't help. A 5xx might pass on a second try.
        if (res.status < 500) fatal = err;
        lastErr = err;
      } else {
        const json = (await res.json()) as { data?: WindsorRow[] };
        return json.data ?? [];
      }
    } catch (e) {
      lastErr = e; // timeout, connection reset, DNS — worth one more try
    }
    if (fatal) throw fatal;
  }
  throw new Error(`Windsor ${q.connector} failed after ${WINDSOR_ATTEMPTS} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
