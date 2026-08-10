// Campaign → Ad group → Ad drill level, shared by the awareness + campaign-perf reports and their
// views. Lets any per-campaign table regroup by ad-set/ad-group or by individual ad, per platform.

export type AdLevel = "campaign" | "adgroup" | "ad";
export const AD_LEVELS: AdLevel[] = ["campaign", "adgroup", "ad"];
export const AD_LEVEL_LABELS: Record<AdLevel, string> = {
  campaign: "Campaign",
  adgroup: "Ad group",
  ad: "Ad",
};

export function parseAdLevel(v: string | null | undefined): AdLevel {
  return v === "adgroup" || v === "ad" ? v : "campaign";
}

// The Windsor field to GROUP BY for a platform at a given level (verified against Windsor:
// google exposes ad_group + ad_name just like Meta/TikTok).
export function groupFieldFor(platform: "meta" | "google" | "tiktok", level: AdLevel): string {
  if (platform === "meta") return level === "ad" ? "ad_name" : level === "adgroup" ? "adset_name" : "campaign";
  if (platform === "tiktok") return level === "ad" ? "ad_name" : level === "adgroup" ? "ad_group_name" : "campaign_name";
  return level === "ad" ? "ad_name" : level === "adgroup" ? "ad_group" : "campaign"; // google
}

// The Windsor field holding the CAMPAIGN name (used for the campaign-name filter) per platform.
export function campaignFieldFor(platform: "meta" | "google" | "tiktok"): string {
  return platform === "tiktok" ? "campaign_name" : "campaign";
}
