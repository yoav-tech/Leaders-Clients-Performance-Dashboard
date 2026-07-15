import type { Channel } from "./types";

// Maps each dashboard channel to a Windsor connector and the field IDs that carry
// spend / purchases / revenue.
//
// google_ads is verified (via get_fields). Windsor normalises field names across
// ad connectors, so meta/tiktok default to the same normalised IDs — but VERIFY each
// once its connector is connected in Windsor:
//   Windsor MCP: get_fields(connector) → confirm the exact `spend`/`conversions`/
//   `conversion_value` (or purchase-specific) field IDs, then adjust below.
//
// shopify (the "site" channel) is e-commerce, not ads: no spend, orders = purchases,
// total revenue = revenue. Field IDs to confirm on connect.

export interface ChannelFieldMap {
  connector: string;
  spendField: string | null; // null for the store channel
  purchasesField: string;
  revenueField: string;
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
    purchasesField: "conversions", // verify: may be "total_purchases" / "actions_purchase"
    revenueField: "conversion_value", // verify: may be "total_purchases_value" / "action_values"
  },
  tiktok: {
    connector: "tiktok",
    spendField: "spend",
    purchasesField: "conversions", // verify: may be "complete_payment" / "purchase"
    revenueField: "conversion_value", // verify: may be "complete_payment_value" / "total_revenue"
  },
  site: {
    connector: "shopify",
    spendField: null,
    purchasesField: "orders", // verify on connect
    revenueField: "total_sales", // verify on connect
  },
};
