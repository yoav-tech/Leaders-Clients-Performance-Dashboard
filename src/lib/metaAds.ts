// Direct Meta Marketing API (Graph) client — an alternative to Windsor for Meta ad data. Auth is a
// long-lived Business Manager **System User token** with `ads_read` (Standard Access — no App Review
// needed for accounts the business manages). Secret in env: META_ACCESS_TOKEN. Optional:
// META_API_VERSION (default below), META_APP_ID/META_APP_SECRET (only for token debug/refresh tools).

const API_VERSION = process.env.META_API_VERSION || "v23.0";
const BASE = "https://graph.facebook.com";

export function metaAdsConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN);
}

// act_<id> normaliser — accepts "act_123", "123", numbers.
export const actId = (v: unknown) => {
  const s = String(v ?? "").replace(/^act_/i, "").trim();
  return s ? `act_${s}` : "";
};

export interface GraphError { message: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string }

// One Graph GET. Throws with Meta's error message on non-2xx (so access/permission issues surface).
export async function metaGraph<T = unknown>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!metaAdsConfigured()) throw new Error("Meta API not configured (missing META_ACCESS_TOKEN)");
  const url = new URL(`${BASE}/${API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  url.searchParams.set("access_token", process.env.META_ACCESS_TOKEN ?? "");
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const j = (await res.json().catch(() => ({}))) as { error?: GraphError } & Record<string, unknown>;
  if (!res.ok || j.error) {
    const e = j.error;
    throw new Error(`Meta ${res.status}: ${e?.message ?? "unknown"}${e?.code ? ` (code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})` : ""}`);
  }
  return j as T;
}

export interface InsightsOpts {
  level?: "account" | "campaign" | "adset" | "ad";
  fields?: string[];
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  breakdowns?: string[];
  filtering?: unknown[]; // Graph filtering spec
  limit?: number; // page size (default 500)
  timeIncrement?: number | "all_days" | "monthly"; // 1 = daily rows
}

const DEFAULT_FIELDS = [
  "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "clicks", "reach", "frequency", "cpm", "ctr",
  "actions", "action_values", "video_thruplay_watched_actions", "video_p100_watched_actions",
];

// Pull insights for one ad account, following paging to completion. Returns the raw insight rows
// (Meta's shape — `actions`/`action_values` are arrays of {action_type, value}).
export async function metaInsights(accountId: string, opts: InsightsOpts): Promise<Record<string, unknown>[]> {
  const acc = actId(accountId);
  if (!acc) throw new Error("metaInsights: empty account id");
  const params: Record<string, string> = {
    level: opts.level ?? "account",
    fields: (opts.fields ?? DEFAULT_FIELDS).join(","),
    time_range: JSON.stringify({ since: opts.since, until: opts.until }),
    limit: String(opts.limit ?? 500),
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
  };
  if (opts.breakdowns?.length) params.breakdowns = opts.breakdowns.join(",");
  if (opts.filtering) params.filtering = JSON.stringify(opts.filtering);
  if (opts.timeIncrement != null) params.time_increment = String(opts.timeIncrement);

  const out: Record<string, unknown>[] = [];
  let path: string | null = `${acc}/insights`;
  let pageParams: Record<string, string> | null = params;
  let guard = 0;
  while (path && guard++ < 200) {
    const j: { data?: Record<string, unknown>[]; paging?: { next?: string; cursors?: { after?: string } } } =
      await metaGraph(path, pageParams ?? {});
    for (const r of j.data ?? []) out.push(r);
    const after = j.paging?.cursors?.after;
    if (j.paging?.next && after) {
      pageParams = { ...params, after };
    } else {
      path = null;
    }
  }
  return out;
}

// Convenience: sum a named action_type out of Meta's `actions` array (e.g. "lead", "onsite_conversion.lead_grouped").
export function metaAction(row: Record<string, unknown>, ...types: string[]): number {
  const arr = row.actions as { action_type?: string; value?: string }[] | undefined;
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const a of arr) if (a.action_type && types.includes(a.action_type)) s += Number(a.value ?? 0) || 0;
  return s;
}

// Which ad accounts the token can actually see (for validation / debugging access).
export async function metaListAccounts(): Promise<{ id: string; name: string; currency?: string }[]> {
  const j = await metaGraph<{ data?: { account_id?: string; id?: string; name?: string; currency?: string }[] }>("me/adaccounts", {
    fields: "account_id,name,currency,account_status",
    limit: "500",
  });
  return (j.data ?? []).map((a) => ({ id: a.account_id ?? String(a.id ?? "").replace(/^act_/, ""), name: a.name ?? "", currency: a.currency }));
}
