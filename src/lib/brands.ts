// Central brand configuration.
//
// Meta ad-account IDs are confirmed (via the connected Meta MCP). Google Ads and
// TikTok Ads account IDs are placeholders (null) until mapped during Windsor setup —
// see the "Open items" section of the build plan. The ingestion job skips a channel
// whose account id is null, so the dashboard degrades gracefully until they're filled.

export type StorePlatform = "shopify" | "quickshop";
export type Currency = "ILS" | "USD";
export type ChannelKey = "google" | "meta" | "tiktok" | "site";

export interface BrandConfig {
  id: string; // stable slug used as a key everywhere
  name: string; // English display name
  nameHe: string; // Hebrew display name
  metaAccountId: string | null;
  googleAccountId: string | null;
  tiktokAccountId: string | null;
  storePlatform: StorePlatform;
  storeId: string | null; // Shopify shop domain or QuickShop store id
  nativeCurrency: Currency; // default currency for the brand's accounts
  // Per-channel currency override, for when one platform's account bills in a
  // different currency than the rest (e.g. Seacret: Meta/Google USD, TikTok ILS).
  channelCurrency?: Partial<Record<ChannelKey, Currency>>;
  targetRoas: number; // for green/red coloring
  monthlyBudget: number; // total monthly ad budget (ILS) for pacing; 0 = pacing hidden
  // Awareness/media-plan brands (no store, no ROAS) — get the plan-vs-execution view instead
  // of the conversion dashboard, and are excluded from digest/alerts.
  mediaPlan?: MediaPlan;
}

// A planned media buy line (video/awareness), per platform + campaign type, over a flight.
export type CampaignType = "influencers" | "ugc" | "reach";
export interface MediaPlanLine {
  platform: "meta" | "tiktok";
  type: CampaignType;
  budget: number; // ILS
  views: number;
  thruplay: number;
  impressions?: number;
  reach?: number;
  cpm?: number;
  flightStart: string; // YYYY-MM-DD (this line's start)
  flightEnd: string;
}
export interface MediaPlan {
  flightStart: string; // overall flight window
  flightEnd: string;
  lines: MediaPlanLine[];
}

export const BRANDS: BrandConfig[] = [
  {
    id: "argania",
    name: "Argania",
    nameHe: "ארגניה",
    metaAccountId: "585931111431913",
    googleAccountId: "609-375-7944",
    tiktokAccountId: "7113477751625105409",
    storePlatform: "quickshop",
    storeId: "argania", // QuickShop store slug (my-quickshop.com/shops/argania)
    nativeCurrency: "ILS",
    targetRoas: 3,
    monthlyBudget: 100000,
  },
  {
    id: "la-beaute",
    name: "La Beaute",
    nameHe: "לה בוטה",
    metaAccountId: "1443549792685858",
    googleAccountId: "496-462-4494",
    tiktokAccountId: "7374398535632125968",
    storePlatform: "shopify",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 3,
    monthlyBudget: 100000,
  },
  {
    id: "studio-pasha",
    name: "Studio Pasha",
    nameHe: "סטודיו פשה",
    metaAccountId: "701860643503981",
    googleAccountId: "175-664-3054",
    tiktokAccountId: null, // TikTok not yet connected in Windsor
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 3,
    monthlyBudget: 50000,
  },
  {
    id: "seacret",
    name: "Seacret",
    nameHe: "סיקרט",
    metaAccountId: "1003022536455927",
    googleAccountId: "339-978-5945",
    tiktokAccountId: "7350287669353578498",
    storePlatform: "shopify",
    storeId: null,
    nativeCurrency: "USD", // Meta & Google bill in USD
    channelCurrency: { tiktok: "ILS" }, // TikTok account bills in ILS

    targetRoas: 3,
    monthlyBudget: 100000,
  },
  {
    id: "style",
    name: "Style",
    nameHe: "סטייל",
    metaAccountId: "1347113570125922", // Meta: סטייל
    googleAccountId: null,
    tiktokAccountId: "7660542426796277777", // TikTok: Style Hair Care
    storePlatform: "quickshop", // no store — awareness only (storeId null ⇒ skipped)
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    monthlyBudget: 0,
    // Awareness media plan (video), split by platform + campaign type (from the breakdown).
    mediaPlan: {
      flightStart: "2026-07-09",
      flightEnd: "2026-07-31",
      lines: [
        { platform: "meta", type: "influencers", budget: 3475, views: 217188, thruplay: 69500, flightStart: "2026-07-12", flightEnd: "2026-07-31" },
        { platform: "meta", type: "ugc", budget: 1490, views: 58203, thruplay: 18625, flightStart: "2026-07-09", flightEnd: "2026-07-31" },
        { platform: "meta", type: "reach", budget: 1035, views: 0, thruplay: 0, impressions: 258750, reach: 129375, cpm: 4, flightStart: "2026-07-09", flightEnd: "2026-07-31" },
        { platform: "tiktok", type: "influencers", budget: 4200, views: 291667, thruplay: 93333, flightStart: "2026-07-12", flightEnd: "2026-07-31" },
        { platform: "tiktok", type: "ugc", budget: 1800, views: 82721, thruplay: 26471, flightStart: "2026-07-09", flightEnd: "2026-07-31" },
      ],
    },
  },
];

export function getBrand(id: string): BrandConfig | undefined {
  return BRANDS.find((b) => b.id === id);
}
