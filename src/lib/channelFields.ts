import type { Channel } from "./types";

// Maps each dashboard channel to a Windsor connector and the field IDs that carry
// spend / purchases / revenue. All verified against Argania's live data.
//
// Meta uses the "omni purchase" fields (match Meta Ads Manager's Purchases / value).
// TikTok has no direct website-purchase-value field, so revenue is derived from its
// website ROAS: revenue = complete_payment_roas * spend (set revenueRoasField).
// Shopify ("site") is verified once a Shopify store is connected.

export interface ChannelFieldMap {
  connector: string;
  spendField: string | null; // null for the store channel
  purchasesField: string;
  revenueField: string | null; // direct revenue field, or null when derived from ROAS
  revenueRoasField?: string; // if set (and revenueField null), revenue = row[roas] * spend
  // Optional Windsor read options, e.g. Meta attribution window.
  options?: Record<string, string>;
}

export const CHANNEL_FIELDS: Record<Exclude<Channel, "site"> | "site", ChannelFieldMap> = {
  google: {
    connector: "google_ads",
    spendField: "spend",
    purchasesField: "conversions",
    revenueField: "conversion_value",
  },
  meta: {
    connector: "facebook",
    spendField: "spend",
    purchasesField: "actions_omni_purchase",
    revenueField: "action_values_omni_purchase",
    // Meta Ads Manager standard. Change to "1d_click" for a more conservative view.
    options: { attribution_window: "7d_click,1d_view" },
  },
  tiktok: {
    connector: "tiktok",
    spendField: "spend",
    purchasesField: "complete_payment", // website purchases
    revenueField: null,
    revenueRoasField: "complete_payment_roas", // revenue = roas * spend
  },
  site: {
    connector: "shopify",
    spendField: null,
    purchasesField: "orders", // verify on Shopify connect
    revenueField: "total_sales", // verify on Shopify connect
  },
};
