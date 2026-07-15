// Central brand configuration.
//
// Meta ad-account IDs are confirmed (via the connected Meta MCP). Google Ads and
// TikTok Ads account IDs are placeholders (null) until mapped during Windsor setup —
// see the "Open items" section of the build plan. The ingestion job skips a channel
// whose account id is null, so the dashboard degrades gracefully until they're filled.

export type StorePlatform = "shopify" | "quickshop";
export type Currency = "ILS" | "USD";

export interface BrandConfig {
  id: string; // stable slug used as a key everywhere
  name: string; // English display name
  nameHe: string; // Hebrew display name
  metaAccountId: string | null;
  googleAccountId: string | null;
  tiktokAccountId: string | null;
  storePlatform: StorePlatform;
  storeId: string | null; // Shopify shop domain or QuickShop store id
  nativeCurrency: Currency;
  targetRoas: number; // for green/red coloring
}

export const BRANDS: BrandConfig[] = [
  {
    id: "argania",
    name: "Argania",
    nameHe: "ארגניה",
    metaAccountId: "585931111431913",
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 3,
  },
  {
    id: "la-beaute",
    name: "La Beaute",
    nameHe: "לה בוטה",
    metaAccountId: "1443549792685858",
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "shopify",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 3,
  },
  {
    id: "studio-pasha",
    name: "Studio Pasha",
    nameHe: "סטודיו פשה",
    metaAccountId: "701860643503981",
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 3,
  },
  {
    id: "seacret",
    name: "Seacret",
    nameHe: "סיקרט",
    metaAccountId: "1003022536455927",
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "shopify",
    storeId: null,
    nativeCurrency: "USD",
    targetRoas: 3,
  },
];

export function getBrand(id: string): BrandConfig | undefined {
  return BRANDS.find((b) => b.id === id);
}
