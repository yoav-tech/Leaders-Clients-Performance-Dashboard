// Live account insights read straight from the Meta Marketing API (ads_read) — the demonstrable,
// first-party read that also satisfies Meta App Review (a reviewer sees ads_read producing data in
// the UI). Additive to Windsor: surfaces metrics we don't otherwise show (messaging/WhatsApp
// conversations started, landing-page views) alongside the basics. Cached, and returns null for
// accounts the System User can't access (so unassigned accounts render nothing, never an error).
import { unstable_cache } from "next/cache";
import { metaAdsConfigured, metaInsights, metaAction } from "./metaAds";

export interface MetaDirectInsights {
  accountId: string;
  spend: number; impressions: number; reach: number; frequency: number | null; clicks: number; ctr: number | null;
  purchases: number; purchaseValue: number; leads: number; messaging: number; landingPageViews: number;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
function actionValue(row: Record<string, unknown>, ...types: string[]): number {
  const arr = row.action_values as { action_type?: string; value?: string }[] | undefined;
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => (a.action_type && types.includes(a.action_type) ? s + n(a.value) : s), 0);
}

async function _get(accountId: string, from: string, to: string): Promise<MetaDirectInsights | null> {
  if (!metaAdsConfigured() || !accountId) return null;
  try {
    const rows = await metaInsights(accountId, {
      level: "account", since: from, until: to,
      fields: ["spend", "impressions", "reach", "frequency", "clicks", "ctr", "actions", "action_values"],
    });
    const r = rows[0];
    if (!r) return null;
    return {
      accountId,
      spend: n(r.spend), impressions: n(r.impressions), reach: n(r.reach),
      frequency: r.frequency != null ? n(r.frequency) : null, clicks: n(r.clicks),
      ctr: r.ctr != null ? n(r.ctr) / 100 : null, // Meta returns CTR as a percentage
      // Meta reports the SAME purchases under ~8 overlapping action_type labels (purchase,
      // omni_purchase, onsite_web_purchase, fb_pixel_purchase, …) — summing them multiplies the
      // count. Use the single canonical `omni_purchase` (matches Windsor's actions_purchase exactly).
      purchases: metaAction(r, "omni_purchase"),
      purchaseValue: actionValue(r, "omni_purchase"),
      leads: metaAction(r, "lead"),
      messaging: metaAction(r, "onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d"),
      landingPageViews: metaAction(r, "landing_page_view"),
    };
  } catch {
    return null; // no access to this account (unassigned) or API hiccup — render nothing
  }
}

// Shared 30-min cache, keyed by account + range (metrics tag so ingest revalidation clears it too).
export const getMetaDirectInsights = unstable_cache(_get, ["meta-direct-insights-v1"], { revalidate: 1800, tags: ["metrics"] });
