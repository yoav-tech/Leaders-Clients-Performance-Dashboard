// Thin client for the Windsor.ai REST API.
// Docs pattern: https://connectors.windsor.ai/<connector>?api_key=...&date_from=...&date_to=...&fields=...
// The response is JSON: { data: [ { <field>: <value>, ... } ] }

const BASE = "https://connectors.windsor.ai";

export interface WindsorQuery {
  connector: string; // e.g. "google_ads", "facebook", "tiktok", "shopify"
  fields: string[]; // field IDs (from get_fields)
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  accounts?: string[]; // optional account-id filter
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

  const url = `${BASE}/${q.connector}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Windsor ${q.connector} ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: WindsorRow[] };
  return json.data ?? [];
}

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
