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
  // Per-KPI targets for the campaign explorer's goal-based coloring (lower-is-better metrics).
  // Only the one matching the brand's profile is used. Tune per client; omit to skip coloring.
  targetCpv?: number; // views brands — cost per view (ILS)
  targetCpl?: number; // leads brands — cost per lead (ILS)
  targetCpi?: number; // app brands — cost per install (ILS)
  monthlyBudget: number; // total monthly ad budget (ILS) for pacing; 0 = pacing hidden
  // Awareness/media-plan brands (no store, no ROAS) — get the plan-vs-execution view instead
  // of the conversion dashboard, and are excluded from digest/alerts.
  mediaPlan?: MediaPlan;
  // App-install brands (e.g. Haat) — KPI is installs/CPI, get the app-install view; excluded
  // from the conversion digest/alerts.
  appInstall?: boolean;
  // Multi-section app/leads report: each section is a Meta account (Delivery app + HR leads).
  appSections?: AppSectionConfig[];
  // Awareness report across shared accounts, filtered by campaign name (e.g. SCJ).
  awarenessSources?: AwarenessSourceConfig[];
  campaignFilter?: string; // lowercase substring campaigns must contain
  // Google search snapshot by competitive campaign type (e.g. Colgate: Total + Optic White).
  googleSnapshot?: GoogleSnapshotConfig[];
  // General campaign-performance report across shared accounts, filtered by campaignFilter
  // (e.g. Leaders / Bestie inside the LEADERS Meta + LDRS Google accounts).
  perfSources?: PerfSourceConfig[];
  // Which daily-digest table a client belongs to. Derived from the flags above by default
  // (reportGroupOf) — set explicitly only to override for a new client.
  reportGroup?: ReportGroup;
}

// Daily-digest client categories.
export type ReportGroup = "ecommerce" | "views" | "leads" | "impshare";

export interface AppSectionConfig {
  key: string;
  title: string;
  account: string; // Meta account id
  kind: "app" | "leads"; // app funnel (install→reg→purchase) vs leads
  budget?: number; // monthly ad budget (ILS) for pacing; 0/undefined = projection only
}

// Awareness report (e.g. SCJ) — reach/views campaigns inside SHARED accounts, matched by a
// campaign-name filter (campaignFilter).
export interface AwarenessSourceConfig {
  platform: "meta" | "google" | "tiktok";
  account: string;
  title: string;
}

// Google search snapshot (e.g. Colgate) — accounts grouped by competitive campaign type.
export interface GoogleSnapshotConfig {
  account: string; // Google Ads account id
  title: string;
}

// General campaign-performance sources (e.g. Leaders / Bestie) — pull campaigns from shared
// Meta/Google accounts, filtered by campaign name, shown as a per-campaign performance table.
export interface PerfSourceConfig {
  platform: "meta" | "google";
  account: string;
  title: string;
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
    targetCpv: 0.03, // default CPV goal (ILS) — tune per client
    monthlyBudget: 12000, // fixed monthly awareness budget; pace is computed over the picked range
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
    // Full awareness tables (spend/impressions/reach/views per source + campaign), same as the
    // other views clients. Dedicated accounts → no campaign-name filter (all campaigns count).
    awarenessSources: [
      { platform: "meta", account: "1347113570125922", title: "Meta · סטייל" },
      { platform: "tiktok", account: "7660542426796277777", title: "TikTok · Style Hair Care" },
    ],
  },
  {
    id: "haat",
    name: "Haat Delivery",
    nameHe: "האט",
    metaAccountId: "1234295457784453", // Meta: Haat Delivery IL
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop", // no store — app installs (storeId null ⇒ skipped)
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    monthlyBudget: 150000, // total Haat monthly budget (both sections) for pacing
    appInstall: true,
    appSections: [
      { key: "delivery", title: "Delivery · אפליקציה", account: "1234295457784453", kind: "app", budget: 0 },
      { key: "hr", title: "HR · גיוס עובדים", account: "1063774221665705", kind: "leads", budget: 0 },
    ],
  },
  {
    id: "scj",
    name: "SCJ",
    nameHe: "SCJ",
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    targetCpv: 0.03, // default CPV goal (ILS) — tune per client
    monthlyBudget: 84000,
    campaignFilter: "scj",
    awarenessSources: [
      { platform: "meta", account: "638387658529372", title: "Meta · LEADERS" },
      { platform: "google", account: "566-212-3115", title: "Google · LDRS" },
    ],
  },
  {
    id: "colgate",
    name: "Colgate",
    nameHe: "קולגייט",
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    monthlyBudget: 0,
    googleSnapshot: [
      { account: "265-522-0192", title: "Total" },
      { account: "565-797-1550", title: "Optic White" },
    ],
  },
  {
    id: "leaders",
    name: "Leaders",
    nameHe: "לידרס",
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    targetCpl: 85, // default CPL goal (ILS) — tune per client
    monthlyBudget: 5000,
    campaignFilter: "leaders",
    perfSources: [
      { platform: "meta", account: "638387658529372", title: "Meta · LEADERS" },
      { platform: "google", account: "566-212-3115", title: "Google · LDRS" },
    ],
  },
  {
    id: "bestie",
    name: "Bestie",
    nameHe: "בסטי",
    metaAccountId: null,
    googleAccountId: null,
    tiktokAccountId: null,
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    targetCpl: 85, // default CPL goal (ILS) — tune per client
    monthlyBudget: 2500,
    campaignFilter: "bestie",
    perfSources: [
      { platform: "meta", account: "638387658529372", title: "Meta · LEADERS" },
      { platform: "google", account: "566-212-3115", title: "Google · LDRS" },
    ],
  },
];

export function getBrand(id: string): BrandConfig | undefined {
  return BRANDS.find((b) => b.id === id);
}

// The daily-digest table a client belongs to. Explicit reportGroup wins; otherwise derived from
// the brand's report flags — so a new client auto-classifies from its config.
export function reportGroupOf(b: BrandConfig): ReportGroup {
  if (b.reportGroup) return b.reportGroup;
  if (b.googleSnapshot) return "impshare"; // Colgate
  if (b.appInstall || b.perfSources) return "leads"; // Haat, Leaders, Bestie
  if (b.awarenessSources || b.mediaPlan) return "views"; // SCJ, Style
  return "ecommerce"; // Argania, La Beaute, Studio Pasha, Seacret
}

// The campaign-explorer KPI profile — which metric columns + goal the brand's campaign tables use.
export type CampaignProfile = "ecommerce" | "views" | "leads" | "app" | "impshare";
export function campaignProfileOf(b: BrandConfig): CampaignProfile {
  if (b.googleSnapshot) return "impshare"; // Colgate
  if (b.appInstall) return "app"; // Haat
  if (b.awarenessSources || b.mediaPlan) return "views"; // SCJ, Style
  if (b.perfSources) return "leads"; // Leaders, Bestie
  return "ecommerce"; // Argania, La Beaute, Studio Pasha, Seacret
}

// The lower-is-better target for a brand's profile (for the explorer's goal coloring), or null.
export function campaignTargetOf(b: BrandConfig): number | null {
  const p = campaignProfileOf(b);
  return p === "views" ? b.targetCpv ?? null : p === "leads" ? b.targetCpl ?? null : p === "app" ? b.targetCpi ?? null : null;
}

// Ad channels available to the campaign explorer for a brand, each resolved to a Windsor account
// and a campaign-name filter. Dedicated-account brands (ecommerce/app) → empty filter; shared-
// account brands (awareness/perf) → the brand's campaignFilter.
export interface ExplorerChannel { id: "meta" | "google" | "tiktok"; label: string; account: string; filter: string }
const CH_LABEL: Record<"meta" | "google" | "tiktok", string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };
export function explorerChannels(b: BrandConfig): ExplorerChannel[] {
  const out: ExplorerChannel[] = [];
  const add = (id: "meta" | "google" | "tiktok", account: string | null, filter: string) => {
    if (account) out.push({ id, label: CH_LABEL[id], account, filter });
  };
  const filter = (b.campaignFilter ?? "").toLowerCase();
  if (b.awarenessSources?.length) {
    for (const s of b.awarenessSources) add(s.platform, s.account, filter);
  } else if (b.perfSources?.length) {
    for (const s of b.perfSources) add(s.platform, s.account, filter);
  } else {
    add("meta", b.metaAccountId, "");
    add("google", b.googleAccountId, "");
    add("tiktok", b.tiktokAccountId, "");
  }
  return out;
}
