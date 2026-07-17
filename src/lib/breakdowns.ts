import type { Channel } from "./types";

export type Dimension =
  | "campaign"
  | "audience"
  | "ad"
  | "age"
  | "gender"
  | "location"
  | "placement"
  | "discount_code";

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
};

// Dimensions available for a channel (ad channels from the map; store = discount codes).
export function dimensionsFor(channel: Channel): Dimension[] {
  if (channel === "site") return ["discount_code"];
  return Object.keys(DIMENSION_FIELDS[channel as "google" | "meta" | "tiktok"]) as Dimension[];
}
