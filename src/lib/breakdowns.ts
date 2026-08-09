import type { Channel } from "./types";

export type Dimension =
  | "campaign"
  | "audience"
  | "ad"
  | "age"
  | "gender"
  | "location"
  | "placement"
  | "discount_code"
  // Store first-party UTM dimensions (site channel).
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "utm_term";

// Windsor field id for each (ad channel, dimension). Missing = unsupported for that channel.
export const DIMENSION_FIELDS: Record<"google" | "meta" | "tiktok", Partial<Record<Dimension, string>>> = {
  google: { campaign: "campaign", audience: "ad_group", location: "country" },
  meta: {
    campaign: "campaign",
    audience: "adset_name",
    ad: "ad_name",
    age: "age",
    gender: "gender",
    location: "country",
    placement: "publisher_platform",
  },
  tiktok: {
    campaign: "campaign_name",
    audience: "adgroup_name",
    ad: "ad_name",
    age: "age",
    gender: "gender",
    location: "country_code",
  },
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  campaign: "Campaign",
  audience: "Audience",
  ad: "Ad",
  age: "Age",
  gender: "Gender",
  location: "Location",
  placement: "Placement",
  discount_code: "Discount code",
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_content: "Content",
  utm_term: "Keyword",
};

// Store UTM dimensions → the PaidOrder field they group by.
export const UTM_DIMENSIONS: Record<string, "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm"> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
};

// Dimensions available for a channel. Store: first-party UTM dimensions + discount codes.
export function dimensionsFor(channel: Channel): Dimension[] {
  if (channel === "site") return ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "discount_code"];
  return Object.keys(DIMENSION_FIELDS[channel as "google" | "meta" | "tiktok"]) as Dimension[];
}
