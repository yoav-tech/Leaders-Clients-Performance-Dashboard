// ============================================================================================
// חוקי בניית פריסת מדיה — Media planning rules
// ============================================================================================
//
// THIS FILE IS THE PLANNING DOCTRINE. Every number the media-plan builder uses to make a
// decision lives here and nowhere else: which funnel stages a client type is planned against,
// how much of a budget each stage may take, how campaign names map to stages, how far a budget
// may scale in one month, and when a cell's own performance is trusted enough to move money.
//
// The builder (mediaPlanBuilder.ts) contains no planning judgement — it reads these rules,
// applies them to the client's data, and returns the result. To change how Leaders plans, edit
// this file; you should never need to touch the builder.
//
// The written version of these rules, with the reasoning behind each number and the decisions
// still open, is docs/media-plan-playbook.md. Keep the two in sync — the playbook is what the
// media team reviews, this file is what runs.
//
// Numbers marked [PROPOSED] are defaults chosen to be defensible, NOT Leaders methodology.
// They are meant to be replaced by the team's own figures before the automation is switched on.
import type { CampaignProfile } from "./brands";

export type AdChannel = "meta" | "google" | "tiktok";

// A funnel stage is a planning bucket, not a platform object. Campaigns are matched into one by
// name (STAGE_PATTERNS), so the naming convention in the ad accounts is part of the doctrine.
export type FunnelStage =
  | "awareness"
  | "prospecting"
  | "retargeting"
  | "brand_search"
  | "generic_search"
  | "shopping"
  | "video_views"
  | "influencers"
  | "ugc"
  | "installs"
  | "leads";

export const STAGE_LABEL: Record<FunnelStage, string> = {
  awareness: "חשיפה · Reach",
  prospecting: "גיוס קהל חדש · Prospecting",
  retargeting: "רימרקטינג · Retargeting",
  brand_search: "חיפוש מותגי · Brand search",
  generic_search: "חיפוש גנרי · Generic search",
  shopping: "Shopping / PMax",
  video_views: "צפיות בווידאו · Views",
  influencers: "משפיענים · Influencers",
  ugc: "UGC",
  installs: "התקנות · Installs",
  leads: "לידים · Leads",
};

export const CHANNEL_LABEL: Record<AdChannel, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

// The single KPI a client type is planned against. ROAS is higher-is-better; every other one is
// a cost per outcome, so lower is better — performanceIndex() normalises that away.
export type PlanKpi = "roas" | "cpv" | "cpl" | "cpi" | "cpm";
export const KPI_LABEL: Record<PlanKpi, string> = { roas: "ROAS", cpv: "CPV", cpl: "CPL", cpi: "CPI", cpm: "CPM" };
export const KPI_HIGHER_IS_BETTER: Record<PlanKpi, boolean> = { roas: true, cpv: false, cpl: false, cpi: false, cpm: false };

// ---------------------------------------------------------------- 1. funnel stages per client type

export interface StageRule {
  stage: FunnelStage;
  role: string; // what this stage is for — shown in the playbook, not in client-facing output
  // Which channels can actually run this stage. Used to decide where a stage the client isn't
  // running today would open (see GUARDRAILS.openMissingStages), and to keep a stage off a
  // platform that can't serve it — brand search doesn't exist on Meta.
  channels: AdChannel[];
  // Share bands, as a fraction of the whole plan. The allocation may move money between stages
  // on performance, but never outside these bands. minShare is a floor the stage gets even when
  // it underperforms (it exists for a reason); maxShare stops one stage eating the plan.
  minShare: number;
  maxShare: number;
  defaultShare: number; // used when the client has no usable history at all
}

export interface ProfileRules {
  label: string; // Hebrew name of the client type
  kpi: PlanKpi;
  stages: StageRule[]; // upper funnel → lower funnel; also the presentation order
  // Where a campaign lands when its name carries no stage signal. A channel may be left out —
  // for a Google-only client type there is no sensible Meta default — in which case the channel
  // falls back to the first stage the rules say it can run, and is skipped if there is none.
  channelDefaults: Partial<Record<AdChannel, FunnelStage>>;
}

// [PROPOSED] The share bands below are the main thing for the media team to argue with.
// defaultShare within a profile should sum to 1.
export const PROFILES: Record<CampaignProfile, ProfileRules> = {
  ecommerce: {
    label: "איקומרס · ROAS",
    kpi: "roas",
    channelDefaults: { meta: "prospecting", tiktok: "prospecting", google: "generic_search" },
    stages: [
      { stage: "prospecting", role: "גיוס קהל חדש — מנוע הצמיחה, חייב להישאר הנתח הגדול", channels: ["meta", "tiktok"], minShare: 0.35, maxShare: 0.7, defaultShare: 0.45 },
      { stage: "retargeting", role: "סגירת קהל שכבר נחשף — יעיל אך מוגבל בגודל הקהל", channels: ["meta", "tiktok", "google"], minShare: 0.08, maxShare: 0.25, defaultShare: 0.15 },
      { stage: "shopping", role: "Shopping / PMax — ביקוש קיים עם כוונת קנייה", channels: ["google", "meta"], minShare: 0.05, maxShare: 0.35, defaultShare: 0.2 },
      { stage: "generic_search", role: "חיפוש גנרי — ביקוש קטגורי", channels: ["google"], minShare: 0.03, maxShare: 0.25, defaultShare: 0.13 },
      { stage: "brand_search", role: "חיפוש מותגי — הגנה על התנועה המותגית, זול ותמיד נדרש", channels: ["google"], minShare: 0.03, maxShare: 0.12, defaultShare: 0.07 },
    ],
  },
  views: {
    label: "צפיות וחשיפה",
    kpi: "cpv",
    channelDefaults: { meta: "video_views", tiktok: "video_views", google: "video_views" },
    stages: [
      { stage: "awareness", role: "ריץ׳ — כיסוי קהל היעד", channels: ["meta", "tiktok", "google"], minShare: 0.1, maxShare: 0.45, defaultShare: 0.25 },
      { stage: "video_views", role: "צפיות — עומק הצפייה במסר", channels: ["meta", "tiktok", "google"], minShare: 0.15, maxShare: 0.6, defaultShare: 0.35 },
      { stage: "influencers", role: "תוכן משפיענים בהפצה ממומנת", channels: ["meta", "tiktok"], minShare: 0.05, maxShare: 0.45, defaultShare: 0.25 },
      { stage: "ugc", role: "תוכן UGC בהפצה ממומנת", channels: ["meta", "tiktok"], minShare: 0.05, maxShare: 0.35, defaultShare: 0.15 },
    ],
  },
  leads: {
    label: "לידים",
    kpi: "cpl",
    channelDefaults: { meta: "prospecting", tiktok: "prospecting", google: "generic_search" },
    stages: [
      { stage: "prospecting", role: "גיוס פניות מקהל חדש", channels: ["meta", "tiktok"], minShare: 0.3, maxShare: 0.7, defaultShare: 0.45 },
      { stage: "retargeting", role: "החזרת מתעניינים שלא השאירו פרטים", channels: ["meta", "tiktok", "google"], minShare: 0.05, maxShare: 0.25, defaultShare: 0.15 },
      { stage: "generic_search", role: "חיפוש גנרי — ביקוש אקטיבי", channels: ["google"], minShare: 0.1, maxShare: 0.5, defaultShare: 0.3 },
      { stage: "brand_search", role: "חיפוש מותגי", channels: ["google"], minShare: 0.03, maxShare: 0.15, defaultShare: 0.1 },
    ],
  },
  app: {
    label: "התקנות אפליקציה",
    kpi: "cpi",
    channelDefaults: { meta: "installs", tiktok: "installs", google: "installs" },
    stages: [
      { stage: "installs", role: "התקנות — ה-KPI הראשי", channels: ["meta", "tiktok", "google"], minShare: 0.4, maxShare: 0.85, defaultShare: 0.6 },
      { stage: "prospecting", role: "בניית ביקוש סביב האפליקציה", channels: ["meta", "tiktok"], minShare: 0.05, maxShare: 0.3, defaultShare: 0.15 },
      { stage: "retargeting", role: "החזרת משתמשים שהתקינו ולא נרשמו", channels: ["meta", "tiktok", "google"], minShare: 0.05, maxShare: 0.25, defaultShare: 0.15 },
      { stage: "leads", role: "קמפיינים ייעודיים לפניות (למשל גיוס עובדים)", channels: ["meta", "google"], minShare: 0.03, maxShare: 0.3, defaultShare: 0.1 },
    ],
  },
  impshare: {
    label: "נתח חשיפות · Share of voice",
    kpi: "cpm",
    channelDefaults: { google: "generic_search" }, // Colgate is a Google-only client type
    stages: [
      { stage: "generic_search", role: "קטגוריה — שם נמדד נתח החשיפות", channels: ["google"], minShare: 0.5, maxShare: 0.9, defaultShare: 0.7 },
      { stage: "brand_search", role: "הגנה מותגית", channels: ["google"], minShare: 0.1, maxShare: 0.5, defaultShare: 0.3 },
    ],
  },
};

// ---------------------------------------------------------------- 2. campaign name → funnel stage

// Ordered rules: the FIRST match wins, so put the specific ones first. A rule may be limited to
// certain client types and/or channels — "brand" means branded search on Google, but on Meta it
// usually just means brand awareness, which is why brand_search is google-only here.
//
// This is the part of the doctrine that depends on the naming convention inside the ad accounts.
// If campaigns are renamed, update these patterns — or the plan silently falls back to defaults.
export interface StagePattern {
  stage: FunnelStage;
  pattern: RegExp;
  profiles?: CampaignProfile[]; // limit to these client types
  channels?: AdChannel[]; // limit to these channels
}

export const STAGE_PATTERNS: StagePattern[] = [
  // Views clients — content type is what matters, not funnel depth.
  { stage: "influencers", pattern: /influencer|משפיע|משפענ/i, profiles: ["views"] },
  { stage: "ugc", pattern: /\bugc\b/i, profiles: ["views"] },
  { stage: "awareness", pattern: /reach|ריץ|awareness|חשיפ/i, profiles: ["views"] },
  { stage: "video_views", pattern: /video|view|צפי|thruplay/i, profiles: ["views"] },

  // App clients.
  { stage: "leads", pattern: /lead|ליד|form|טופס|\bhr\b|גיוס עובד/i, profiles: ["app"] },
  { stage: "installs", pattern: /install|\bapp\b|אפליקצ|התקנ/i, profiles: ["app"] },

  // Google structure.
  { stage: "shopping", pattern: /pmax|performance ?max|shopping|קניות/i, channels: ["google"] },
  { stage: "retargeting", pattern: /remarket|retarget|rmkt|display|discovery|demand ?gen/i, channels: ["google"] },
  { stage: "brand_search", pattern: /brand|מותג/i, channels: ["google"] },
  { stage: "generic_search", pattern: /search|generic|חיפוש|גנרי/i, channels: ["google"] },

  // Meta / TikTok: warm vs cold vs catalogue.
  { stage: "retargeting", pattern: /retarget|remarket|rmkt|\brtg?\b|warm|ריטרגט|רימרקט|חם/i, channels: ["meta", "tiktok"] },
  { stage: "shopping", pattern: /catalog|\bdpa\b|advantage\+? ?shop|קטלוג/i, channels: ["meta", "tiktok"] },
  { stage: "prospecting", pattern: /prospect|cold|acquisition|\bacq\b|קר|גיוס/i, channels: ["meta", "tiktok"] },
];

// ---------------------------------------------------------------- 3. budget scaling

export interface ScaleStep {
  minIndex: number; // performance vs target (1 = exactly on goal); step applies at or above it
  factor: number; // multiplier on last month's actual spend
  label: string; // Hebrew explanation, quoted verbatim in the plan's rationale
}

// [PROPOSED] Read top-down; the first step whose minIndex is met applies. Deliberately
// conservative — a plan should never whipsaw a client's spend on one month of noise.
export const SCALE_LADDER: ScaleStep[] = [
  { minIndex: 1.25, factor: 1.2, label: "ביצועים מעל היעד באופן מובהק — סקייל של 20%" },
  { minIndex: 1.1, factor: 1.1, label: "ביצועים מעל היעד — סקייל של 10%" },
  { minIndex: 0.95, factor: 1.0, label: "ביצועים בטווח היעד — שמירה על אותו תקציב" },
  { minIndex: 0.8, factor: 0.9, label: "ביצועים מתחת ליעד — הפחתה של 10% עד לייצוב" },
  { minIndex: 0, factor: 0.85, label: "ביצועים הרבה מתחת ליעד — הפחתה של 15% והתמקדות בערוצים הרווחיים" },
];

// Applied to the recommended budget on top of the scale factor. 1.0 = no seasonal adjustment.
// [OPEN] Every month is 1.0 until the media team fills in Leaders' own seasonality. Until then
// the plan makes no seasonal claim, which is the honest default.
export const SEASONALITY: Record<string, { factor: number; note: string }> = {
  "01": { factor: 1, note: "ינואר" },
  "02": { factor: 1, note: "פברואר" },
  "03": { factor: 1, note: "מרץ" },
  "04": { factor: 1, note: "אפריל · פסח" },
  "05": { factor: 1, note: "מאי" },
  "06": { factor: 1, note: "יוני" },
  "07": { factor: 1, note: "יולי" },
  "08": { factor: 1, note: "אוגוסט" },
  "09": { factor: 1, note: "ספטמבר · חגי תשרי" },
  "10": { factor: 1, note: "אוקטובר" },
  "11": { factor: 1, note: "נובמבר · בלאק פריידי" },
  "12": { factor: 1, note: "דצמבר" },
};

// ---------------------------------------------------------------- 4. guardrails

export interface Guardrails {
  lookbackDays: number; // how much history a plan is derived from
  // A cell's own performance only moves money once there is enough of it to mean anything.
  // Below either threshold the cell is planned at neutral efficiency (1.0).
  dataSufficiency: { minSpend: number; minConversions: number };
  // How far a single cell's performance may tilt its share, once it is trusted.
  efficiency: { min: number; max: number };
  // When a stage runs on more than one channel, how lopsided that split may get. Stops a stage
  // from collapsing onto a single platform after one good month.
  withinStageChannelShare: { min: number; max: number };
  // Should the plan open a funnel stage the client is NOT running today? With this off, the
  // share bands are only enforced across the stages that already exist, which lets one stage
  // legitimately hold 100% of the plan. With it on, a missing stage is seeded at its floor on
  // the best-suited channel — which is what makes a plan a recommendation rather than a mirror
  // of last month. Seeded lines are marked in the output and are still subject to minLineBudget.
  openMissingStages: boolean;
  // The floor is a budget, not a percentage: a line under this can't realistically run, so it is
  // folded into the rest of its stage instead of being planned as a token amount.
  minLineBudget: number; // ILS per month
  roundTo: number; // ILS, all line budgets round to this
  maxScaleUp: number; // hard ceiling on the monthly scale factor
  maxScaleDown: number; // hard floor
}

// [PROPOSED]
export const GUARDRAILS: Guardrails = {
  lookbackDays: 90,
  dataSufficiency: { minSpend: 2000, minConversions: 10 },
  efficiency: { min: 0.6, max: 1.5 },
  withinStageChannelShare: { min: 0.15, max: 0.85 },
  openMissingStages: true,
  minLineBudget: 1000,
  roundTo: 50,
  maxScaleUp: 1.2,
  maxScaleDown: 0.85,
};

// ---------------------------------------------------------------- 5. automation

export interface AutomationRules {
  enabled: boolean; // does the monthly cron actually build and notify?
  buildDayOfMonth: number; // documentation of the vercel.json schedule
  requireApproval: true; // a plan NEVER reaches a client without a manager approving it
}

// The 24th-of-the-month automation stays OFF until the rules above are reviewed and signed off
// by the media team. Set MEDIA_PLAN_AUTOMATION=on in the environment to switch it on — the
// approval requirement is not overridable.
export const AUTOMATION: AutomationRules = {
  enabled: process.env.MEDIA_PLAN_AUTOMATION === "on",
  buildDayOfMonth: 24,
  requireApproval: true,
};

// Bumped whenever the doctrine changes, and stored on every plan, so a plan built last month can
// be read against the rules that actually produced it.
export const RULES_VERSION = "2026-08-draft-1";

// ---------------------------------------------------------------- helpers

export function profileRules(profile: CampaignProfile): ProfileRules {
  return PROFILES[profile];
}

export function stageRule(profile: CampaignProfile, stage: FunnelStage): StageRule | null {
  return PROFILES[profile].stages.find((s) => s.stage === stage) ?? null;
}

export function profileStages(profile: CampaignProfile): FunnelStage[] {
  return PROFILES[profile].stages.map((s) => s.stage);
}

// Where a channel's unclassifiable campaigns land: the client type's explicit default when the
// channel can run it, otherwise the first stage the rules allow that channel. null means this
// channel has no place in this client type's funnel at all.
export function defaultStageFor(profile: CampaignProfile, channel: AdChannel): FunnelStage | null {
  const rules = PROFILES[profile];
  const explicit = rules.channelDefaults[channel];
  if (explicit && rules.stages.find((s) => s.stage === explicit)?.channels.includes(channel)) return explicit;
  return rules.stages.find((s) => s.channels.includes(channel))?.stage ?? null;
}

// Map a campaign name onto a funnel stage, per the ordered patterns. Falls back to the channel's
// default stage, and never returns a stage the client type isn't planned against. null means the
// campaign's channel has no place in this client type's funnel.
export function classifyStage(profile: CampaignProfile, channel: AdChannel, name: string): FunnelStage | null {
  const allowed = profileStages(profile);
  const fallback = defaultStageFor(profile, channel);
  for (const rule of STAGE_PATTERNS) {
    if (rule.profiles && !rule.profiles.includes(profile)) continue;
    if (rule.channels && !rule.channels.includes(channel)) continue;
    if (!rule.pattern.test(name)) continue;
    return allowed.includes(rule.stage) ? rule.stage : fallback;
  }
  return fallback;
}

// Performance vs target, normalised so >1 always means "ahead of goal", whichever direction the
// KPI runs in.
export function performanceIndex(kpi: PlanKpi, value: number | null, target: number | null): number | null {
  if (value == null || target == null || value <= 0 || target <= 0) return null;
  return KPI_HIGHER_IS_BETTER[kpi] ? value / target : target / value;
}

export function scaleStepFor(index: number | null): ScaleStep {
  if (index == null) {
    return { minIndex: 0, factor: 1, label: "אין יעד KPI מוגדר — התקציב נשמר ברמת החודש הקודם" };
  }
  const step = SCALE_LADDER.find((s) => index >= s.minIndex) ?? SCALE_LADDER[SCALE_LADDER.length - 1];
  return { ...step, factor: Math.min(GUARDRAILS.maxScaleUp, Math.max(GUARDRAILS.maxScaleDown, step.factor)) };
}

export function seasonalityFor(month: string): { factor: number; note: string } {
  return SEASONALITY[month.slice(5, 7)] ?? { factor: 1, note: "" };
}
