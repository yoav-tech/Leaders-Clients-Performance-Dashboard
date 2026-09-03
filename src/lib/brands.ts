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
  // Target ROAS. Never below MIN_TARGET_ROAS (2.4) — a plan is not built toward a goal the
  // agency would not commit to; a lower value is treated as a config error and the builder plans
  // against 2.4 anyway, saying so in the plan. Also drives the green/red colouring.
  targetRoas: number;
  // Per-KPI targets for the campaign explorer's goal-based coloring (lower-is-better metrics).
  // Only the one matching the brand's profile is used. Tune per client; omit to skip coloring.
  // Views brands — cost per 15-second view (Meta ThruPlay / TikTok 6s), ILS. NOT cost per any
  // view: a 2-second scroll doesn't count. Set it per client from CPV15_BENCHMARK in
  // platformRules.ts — ₪0.03–0.05 for beauty/personal care, up to ₪0.10–0.16 for automotive,
  // finance and other high-consideration verticals. Without it the scale ladder always returns ×1.
  targetCpv?: number;
  targetCpl?: number; // leads brands — cost per lead (ILS)
  targetCpi?: number; // app brands — cost per install (ILS)
  monthlyBudget: number; // total monthly ad budget (ILS) for pacing; 0 = pacing hidden
  // Awareness/media-plan brands (no store, no ROAS) — get the plan-vs-execution view instead
  // of the conversion dashboard, and are excluded from digest/alerts.
  mediaPlan?: MediaPlan;
  // Per-platform media plan (automotive awareness: Chery, Xpeng) — planned budget + 15s-view
  // (thruplay) + 100%-view targets per platform, compared to live actuals (leaders campaigns only).
  platformPlan?: PlatformPlan;
  // Creator/influencer attribution (for the per-influencer / per-content breakdown).
  creators?: CreatorConfig[];
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
  // Marketing command center (Leaders): one view with sub-section tabs (each a brand id), a native
  // content calendar + approvals + briefs. Sub-section brands are read for data but hidden from nav.
  commandCenter?: { subSections: string[] };
  // Hide from the sidebar (still accessible/authorized AND still in reports/digest) — e.g. Bestie is
  // a sub-section of the Leaders command center rather than its own nav entry.
  navHidden?: boolean;
  // Retired/parked client — fully hidden from the platform (nav AND digest/reports), but its data
  // keeps ingesting and is retained. Distinct from navHidden (which stays in reports). e.g. Seacret.
  retired?: boolean;
  // Which daily-digest table a client belongs to. Derived from the flags above by default
  // (reportGroupOf) — set explicitly only to override for a new client.
  reportGroup?: ReportGroup;
  // How many "top ads by ROAS" to show in the client report (view + email). Default 5.
  topAdsCount?: number;
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
  api?: boolean; // pull this section directly from the Google Ads API (accurate IS + Absolute Top);
  // falls back to Windsor when the API isn't configured. Requires the account to be reachable
  // under GOOGLE_ADS_LOGIN_CUSTOMER_ID.
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

// Per-platform media plan (Chery / Xpeng). Each line is one platform's planned commitment for the
// whole flight; actuals are pulled live from Windsor (leaders campaigns only) and compared.
export interface PlatformPlanLine {
  platform: "meta" | "tiktok" | "youtube";
  title: string; // display label, e.g. "Meta", "YouTube · עינת נתן"
  budget: number; // ILS, whole flight
  thruplay: number; // 15s-view target (Meta ThruPlay / TikTok 6s). 0 = not planned
  completedViews: number; // 100%-view target. 0 = not planned
  views?: number; // shorter-view target (Meta 3s / TikTok 2s)
  impressions?: number;
  reach?: number;
}
export interface PlatformPlan {
  flightStart: string;
  flightEnd: string;
  lines: PlatformPlanLine[];
  // Optional lead-generation goal for the flight (dedicated leadgen + bonus conversions count toward
  // the leads total; cpa is the acceptable cost per lead, compared to the leadgen CPL).
  leadTarget?: { leads: number; cpa: number };
}

// Creator/influencer attribution for platform-plan brands. An ad row is attributed to the first
// creator whose `match` token appears in its campaign/adset/ad name (case-insensitive). Order
// matters — put more specific tokens first.
export interface CreatorConfig {
  id: string;
  name: string; // display (Hebrew)
  match: string[]; // lowercase substrings to look for in campaign+adset+ad names
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
    topAdsCount: 10,
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
    topAdsCount: 10,
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
    topAdsCount: 10,
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
    retired: true, // fully hidden from platform + digest; data still ingests & is retained
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
    targetCpv: 0.03, // hair care → the beauty/personal-care end of the ₪0.03–0.16 range
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
    id: "protein-max",
    name: "Protein Max",
    nameHe: "פרוטאין מקס",
    metaAccountId: "5226039734085481", // Meta: Citi · תוספי מזון בע"מ (Protein Max)
    googleAccountId: null,
    tiktokAccountId: "7375940512374882321", // TikTok: pending connection in Windsor
    storePlatform: "quickshop", // no store — video-views awareness only (storeId null ⇒ skipped)
    storeId: null,
    nativeCurrency: "ILS",
    targetRoas: 0,
    targetCpv: 0.03, // supplements → beauty/personal-care end of the ₪0.03–0.16 CPV range
    monthlyBudget: 6000, // fixed monthly awareness budget; pace computed over the picked range
    // Video-views awareness (like Style/SCJ). Dedicated accounts → no campaign-name filter.
    awarenessSources: [
      { platform: "meta", account: "5226039734085481", title: "Meta · Protein Max" },
      { platform: "tiktok", account: "7375940512374882321", title: "TikTok · Protein Max" },
    ],
  },
  {
    id: "chery",
    name: "Chery",
    nameHe: "צ'רי",
    metaAccountId: "425581286160751", // Meta: Chery (shared acct — leaders campaigns only)
    googleAccountId: "258-293-1615", // YouTube via Google Ads (Chery - צ'רי); dashed = Windsor's account_id
    tiktokAccountId: "7196963878691995650", // TikTok: Chery - Auction (bills USD)
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    channelCurrency: { tiktok: "USD" }, // Chery - Auction TikTok bills in USD → ×rate to ILS
    targetRoas: 0,
    targetCpv: 0.16, // planned blended CPV (15s) across Meta ₪0.18 / TikTok ₪0.15
    monthlyBudget: 0, // pacing is plan-based (see platformPlan)
    campaignFilter: "leaders", // ONLY LDRS-managed campaigns (name contains "Leaders")
    awarenessSources: [
      { platform: "meta", account: "425581286160751", title: "Meta · Chery" },
      { platform: "tiktok", account: "7196963878691995650", title: "TikTok · Chery" },
      { platform: "google", account: "258-293-1615", title: "YouTube · Chery" },
    ],
    // Media plan — צ'רי 2026. Meta ₪270k + TikTok ₪270k + YouTube ₪20k (עינת נתן) = ₪560k.
    platformPlan: {
      flightStart: "2026-06-01",
      flightEnd: "2026-10-05",
      lines: [
        { platform: "meta", title: "Meta", budget: 270000, thruplay: 1495305, completedViews: 314014, views: 3604000, impressions: 9642857, reach: 4383117 },
        { platform: "tiktok", title: "TikTok", budget: 270000, thruplay: 1801695, completedViews: 378356, views: 4496000, impressions: 13500000, reach: 6136364 },
        { platform: "youtube", title: "YouTube", budget: 20000, thruplay: 0, completedViews: 0 },
      ],
    },
    creators: [
      { id: "einat", name: "עינת נתן", match: ["einat", "עינת"] },
      { id: "ori", name: "אורי", match: ["ori_laizer", "ori_", "אורי"] },
      { id: "meshi", name: "משי", match: ["meshi", "משי"] },
      { id: "omer", name: "עומר", match: ["omer", "עומר"] },
    ],
  },
  {
    id: "xpeng",
    name: "Xpeng",
    nameHe: "אקספנג",
    metaAccountId: "942726420794582", // Meta: Xpeng (bills USD)
    googleAccountId: null,
    tiktokAccountId: "7286440555192778753", // TikTok: Xpeng - Auction (bills USD)
    storePlatform: "quickshop",
    storeId: null,
    nativeCurrency: "ILS",
    channelCurrency: { meta: "USD", tiktok: "USD" }, // both accounts bill in USD → ×rate to ILS
    targetRoas: 0,
    targetCpv: 0.2, // planned CPV (15s): Meta ₪0.18 / TikTok ₪0.22
    monthlyBudget: 0, // pacing is plan-based (see platformPlan)
    campaignFilter: "leaders",
    awarenessSources: [
      { platform: "meta", account: "942726420794582", title: "Meta · Xpeng" },
      { platform: "tiktok", account: "7286440555192778753", title: "TikTok · Xpeng" },
    ],
    // Media plan — אקספנג. ₪180k total, 50/50 Meta/TikTok. Per-platform targets from each
    // platform's planned CPV (Meta ₪0.18/₪0.68, TikTok ₪0.22/₪0.85); totals reconcile to the plan.
    platformPlan: {
      flightStart: "2026-07-26",
      flightEnd: "2026-10-05",
      lines: [
        { platform: "meta", title: "Meta", budget: 90000, thruplay: 500000, completedViews: 132353, views: 1182857, impressions: 3214286, reach: 1461039 },
        { platform: "tiktok", title: "TikTok", budget: 90000, thruplay: 409091, completedViews: 105882, views: 1182857, impressions: 3214286, reach: 1461039 },
      ],
      leadTarget: { leads: 470, cpa: 153 }, // flight goal: 470 leads @ ₪153 CPA
    },
    creators: [
      // Content themes belong to a creator even when the ad/adset name drops the creator prefix:
      // Marina = reels / jam / imperfect / master; Asi = the real draft / sisters / sharing.
      { id: "marina", name: "מרינה", match: ["marina", "מרינה", "reels", "jam", "imperfect", "master", "dynaudio", "מהאפס", "0 ל-100"] },
      { id: "asi", name: "אסי", match: ["asi", "אסי", "real draft", "draft", "sisters", "האחיות", "sharing", "מי שמבין"] },
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
    monthlyBudget: 100000, // total Haat monthly budget (both sections) for pacing
    appInstall: true,
    appSections: [
      { key: "delivery", title: "Haat delivery IL", account: "1234295457784453", kind: "app", budget: 0 },
      { key: "hr", title: "Haat HR", account: "1063774221665705", kind: "leads", budget: 0 },
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
    targetCpv: 0.03, // TODO: confirm SCJ's vertical and set from CPV15_BENCHMARK (₪0.03–0.16)
    monthlyBudget: 84000,
    campaignFilter: "scj",
    // TikTok bills in USD in the LDRS Group account → converted to ILS (×3) on ingest + in the
    // live explorer, both of which key off the currency Windsor returns for the account.
    channelCurrency: { tiktok: "USD" },
    awarenessSources: [
      { platform: "meta", account: "638387658529372", title: "Meta · LEADERS" },
      { platform: "google", account: "566-212-3115", title: "Google · LDRS" },
      { platform: "tiktok", account: "7153540276647133185", title: "TikTok · LDRS Group" }, // campaign "SCJ - Video Views"
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
      { account: "565-797-1550", title: "Optic White", api: true }, // direct Google Ads API
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
    // Command center: Leaders marketing + Bestie as two sub-sections in one place.
    commandCenter: { subSections: ["leaders", "bestie"] },
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
    // A sub-section of the Leaders command center — reached via Leaders, not its own nav entry.
    navHidden: true,
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
