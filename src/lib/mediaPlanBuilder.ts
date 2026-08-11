// Builds next month's media plan for a brand: channel × funnel stage, budget + forecast.
//
// Two data sources, each used for what it is good at:
//   • daily_metrics (DB)  — per-channel spend/KPIs, already ILS-normalised by the ingester.
//     Drives the baseline budget, the channel split, and every rate used in the forecast.
//   • Windsor (campaigns) — campaign names over the same window, used ONLY to split each
//     channel's spend into funnel stages (and, for ecommerce, to tilt a stage by its ROAS).
//     If Windsor is unavailable the plan still builds, with one default stage per channel.
//
// The allocation is deterministic: share of recent spend, tilted by how each cell performed
// against the brand's own KPI target, then bounded by per-cell floors/caps. The narrative
// (mediaPlanNarrative.ts) explains the numbers; it never produces them.
import { campaignProfileOf, explorerChannels, type BrandConfig, type CampaignProfile } from "./brands";
import { CHANNEL_FIELDS } from "./channelFields";
import { DIMENSION_FIELDS } from "./breakdowns";
import { fetchWindsor, num } from "./windsor";
import { fetchUsdIlsRate, toIls } from "./fx";
import { getSupabase, hasDb } from "./db";
import { shiftDate } from "./dates";

export type AdChannel = "meta" | "google" | "tiktok";

// Funnel stages, per client profile. A stage is a planning bucket, not a platform object —
// campaigns are matched into it by name (see classifyStage).
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

const CHANNEL_LABEL: Record<AdChannel, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

// Which stages a profile plans against, in presentation order (upper funnel → lower funnel).
const PROFILE_STAGES: Record<CampaignProfile, FunnelStage[]> = {
  ecommerce: ["prospecting", "retargeting", "shopping", "generic_search", "brand_search"],
  views: ["awareness", "video_views", "influencers", "ugc"],
  leads: ["prospecting", "retargeting", "generic_search", "brand_search"],
  app: ["installs", "prospecting", "retargeting", "leads"],
  impshare: ["generic_search", "brand_search"],
};

// Where a campaign lands when its name says nothing useful.
const DEFAULT_STAGE: Record<CampaignProfile, Record<AdChannel, FunnelStage>> = {
  ecommerce: { meta: "prospecting", tiktok: "prospecting", google: "generic_search" },
  views: { meta: "video_views", tiktok: "video_views", google: "video_views" },
  leads: { meta: "prospecting", tiktok: "prospecting", google: "generic_search" },
  app: { meta: "installs", tiktok: "installs", google: "installs" },
  impshare: { meta: "generic_search", tiktok: "generic_search", google: "generic_search" },
};

// The one KPI a profile is planned against — lower-is-better except ecommerce (ROAS).
export type PlanKpi = "roas" | "cpv" | "cpl" | "cpi" | "cpm";
const PROFILE_KPI: Record<CampaignProfile, PlanKpi> = {
  ecommerce: "roas",
  views: "cpv",
  leads: "cpl",
  app: "cpi",
  impshare: "cpm",
};
export const KPI_LABEL: Record<PlanKpi, string> = { roas: "ROAS", cpv: "CPV", cpl: "CPL", cpi: "CPI", cpm: "CPM" };

export interface PlanForecast {
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  revenue: number | null;
  roas: number | null;
  views: number | null;
  leads: number | null;
  installs: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
  cpv: number | null;
  cpl: number | null;
  cpi: number | null;
}

export interface PlanLine {
  channel: AdChannel;
  channelLabel: string;
  stage: FunnelStage;
  stageLabel: string;
  budget: number; // ILS for the month
  sharePct: number; // 0..100 of the plan
  prevSpend: number; // same cell's spend in the lookback, normalised to one month (ILS)
  deltaPct: number | null; // budget vs prevSpend
  forecast: PlanForecast;
  note: string; // why this line moved up or down
}

export interface PlanBasis {
  from: string;
  to: string;
  lookbackDays: number;
  stageSource: "windsor" | "channel-only"; // did the funnel split come from campaign names?
  channels: { channel: AdChannel; spend: number; kpi: number | null }[];
}

export interface ScaleDecision {
  factor: number; // applied to the baseline to get the recommendation
  kpi: PlanKpi;
  kpiValue: number | null;
  kpiTarget: number | null;
  index: number | null; // performance vs target: >1 is ahead
  reason: string;
}

export interface MediaPlanDraft {
  brandId: string;
  brandName: string;
  brandNameHe: string;
  month: string; // YYYY-MM
  monthStart: string;
  monthEnd: string;
  profile: CampaignProfile;
  budgetSource: "fixed" | "proposed";
  totalBudget: number;
  baselineBudget: number; // previous full month's actual spend
  recommendedBudget: number;
  scale: ScaleDecision;
  lines: PlanLine[];
  rationale: string[];
  basis: PlanBasis;
}

const LOOKBACK_DAYS = 90;
const MIN_CELL_SHARE = 0.03; // no cell below 3% of the plan
const MAX_CELL_SHARE = 0.6; // no single cell above 60%
const ROUND_TO = 50; // ILS

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step = ROUND_TO) => Math.round(v / step) * step;

// ---------------------------------------------------------------- month helpers

export function monthBounds(month: string): { start: string; end: string; days: number } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, "0")}`, days };
}

// The month a plan built on `date` is for: the next calendar month.
export function nextMonthOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function prevMonthOf(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- stage classification

function classifyStage(profile: CampaignProfile, channel: AdChannel, name: string): FunnelStage {
  const s = name.toLowerCase();
  const fallback = DEFAULT_STAGE[profile][channel];
  const allowed = PROFILE_STAGES[profile];
  const pick = (stage: FunnelStage) => (allowed.includes(stage) ? stage : fallback);

  if (profile === "views") {
    if (/influencer|משפיע|משפענ/.test(s)) return pick("influencers");
    if (/\bugc\b/.test(s)) return pick("ugc");
    if (/reach|ריץ|awareness|חשיפ/.test(s)) return pick("awareness");
    return pick("video_views");
  }
  if (profile === "app") {
    if (/lead|ליד|form|טופס|hr|גיוס עובד/.test(s)) return pick("leads");
    if (/retarget|remarket|rmkt|ריטרגט|רימרקט/.test(s)) return pick("retargeting");
    if (/prospect|cold|acquisition|קר/.test(s)) return pick("prospecting");
    return pick("installs");
  }
  if (channel === "google") {
    if (/pmax|performance ?max|shopping|קניות/.test(s)) return pick("shopping");
    if (/remarket|retarget|rmkt|display|discovery|demand ?gen/.test(s)) return pick("retargeting");
    if (/brand|מותג/.test(s)) return pick("brand_search");
    return pick("generic_search");
  }
  // Meta / TikTok: warm vs cold.
  if (/retarget|remarket|rmkt|\brtg?\b|warm|ריטרגט|רימרקט|חם/.test(s)) return pick("retargeting");
  if (/catalog|dpa|advantage\+? ?shop|קטלוג/.test(s)) return pick("shopping");
  return pick("prospecting");
}

// ---------------------------------------------------------------- channels to plan for

export interface PlanChannel { id: AdChannel; accounts: string[]; filter: string }

// Every ad account a brand's plan should read campaigns from, grouped by channel. Starts from
// the campaign explorer's mapping and adds the two account sets it doesn't model: a snapshot
// brand's competitive Google accounts (Colgate) and an app brand's extra sections (Haat's HR
// account). Grouped by channel because daily_metrics — the source of every rate — is keyed by
// channel, not by account.
export function planChannels(brand: BrandConfig): PlanChannel[] {
  const byChannel = new Map<AdChannel, PlanChannel>();
  const add = (id: AdChannel, account: string | null | undefined, filter: string) => {
    if (!account) return;
    const e = byChannel.get(id) ?? { id, accounts: [], filter };
    if (!e.accounts.includes(account)) e.accounts.push(account);
    byChannel.set(id, e);
  };
  for (const c of explorerChannels(brand)) add(c.id, c.account, c.filter);
  for (const s of brand.googleSnapshot ?? []) add("google", s.account, "");
  for (const s of brand.appSections ?? []) add("meta", s.account, "");
  return [...byChannel.values()];
}

// ---------------------------------------------------------------- lookback (DB)

interface ChannelStats {
  channel: AdChannel;
  spend: number; // ILS over the lookback
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number; // ILS
  views: number;
  leads: number;
  installs: number;
}

const emptyStats = (channel: AdChannel): ChannelStats => ({
  channel, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, views: 0, leads: 0, installs: 0,
});

async function channelStats(brandId: string, from: string, to: string): Promise<Map<AdChannel, ChannelStats>> {
  const out = new Map<AdChannel, ChannelStats>();
  if (!hasDb()) return out;
  const { data, error } = await getSupabase()
    .from("daily_metrics")
    .select("channel,spend_ils,revenue_ils,purchases,impressions,clicks,views,leads,installs")
    .eq("brand_id", brandId)
    .neq("channel", "site")
    .gte("date", from)
    .lte("date", to)
    .limit(20000);
  if (error) throw new Error(`media plan lookback failed: ${error.message}`);
  for (const r of data ?? []) {
    const ch = r.channel as AdChannel;
    const e = out.get(ch) ?? emptyStats(ch);
    e.spend += Number(r.spend_ils);
    e.revenue += Number(r.revenue_ils);
    e.purchases += Number(r.purchases);
    e.impressions += Number(r.impressions);
    e.clicks += Number(r.clicks);
    e.views += Number(r.views);
    e.leads += Number(r.leads);
    e.installs += Number(r.installs);
    out.set(ch, e);
  }
  return out;
}

// A brand's ad spend (ILS) over an inclusive date range — the budget baseline.
async function spendBetween(brandId: string, from: string, to: string): Promise<number> {
  if (!hasDb()) return 0;
  const { data, error } = await getSupabase()
    .from("daily_metrics")
    .select("spend_ils")
    .eq("brand_id", brandId)
    .neq("channel", "site")
    .gte("date", from)
    .lte("date", to)
    .limit(20000);
  if (error) throw new Error(`media plan baseline failed: ${error.message}`);
  return (data ?? []).reduce((s, r) => s + Number(r.spend_ils), 0);
}

// ---------------------------------------------------------------- stage split (Windsor)

interface StageSplit {
  share: number; // 0..1 of the channel's spend
  roasIndex: number | null; // stage ROAS ÷ channel ROAS (ecommerce only)
}

// Split one channel's spend into funnel stages using campaign names, across every account the
// channel covers. Returns null when no account answered — the caller then plans that channel as
// a single stage rather than dropping it.
async function stageSplit(
  brand: BrandConfig,
  profile: CampaignProfile,
  ch: PlanChannel,
  from: string,
  to: string,
  usdIls: number,
): Promise<Map<FunnelStage, StageSplit> | null> {
  const fm = CHANNEL_FIELDS[ch.id];
  const campField = DIMENSION_FIELDS[ch.id].campaign;
  if (!campField || !fm.spendField || !ch.accounts.length) return null;
  const spendField = fm.spendField;

  const wantsRevenue = profile === "ecommerce";
  const metricFields = wantsRevenue
    ? [fm.purchasesField, fm.revenueField ?? fm.revenueRoasField].filter((f): f is string => Boolean(f))
    : [];
  const fields = [...new Set(["account_id", "currency", campField, spendField, ...metricFields])];

  // One read per account: a failing account is skipped, not fatal for the channel.
  const reads = await Promise.all(
    ch.accounts.map(async (account) => {
      try {
        const rows = await fetchWindsor({
          connector: fm.connector,
          fields,
          dateFrom: from,
          dateTo: to,
          accounts: [account],
          options: fm.options,
          cacheSeconds: 3600,
        });
        return { account, rows };
      } catch {
        return null;
      }
    }),
  );
  if (reads.every((r) => r === null)) return null;

  const byStage = new Map<FunnelStage, { spend: number; revenue: number }>();
  let total = 0;
  let totalRevenue = 0;
  for (const read of reads) {
    if (!read) continue;
    const acc = normId(read.account);
    for (const r of read.rows) {
      if (normId(r.account_id) !== acc) continue;
      const name = String(r[campField] ?? "").trim();
      if (!name) continue;
      if (ch.filter && !name.toLowerCase().includes(ch.filter)) continue;

      const currency = String(r.currency ?? brand.channelCurrency?.[ch.id] ?? brand.nativeCurrency).toUpperCase();
      const spend = toIls(num(r[spendField]), currency, usdIls);
      if (spend <= 0) continue;
      let revenue = 0;
      if (wantsRevenue) {
        revenue = fm.revenueField
          ? toIls(num(r[fm.revenueField]), currency, usdIls)
          : fm.revenueRoasField
            ? num(r[fm.revenueRoasField]) * spend // TikTok reports ROAS, not value
            : 0;
      }

      const stage = classifyStage(profile, ch.id, name);
      const e = byStage.get(stage) ?? { spend: 0, revenue: 0 };
      e.spend += spend;
      e.revenue += revenue;
      byStage.set(stage, e);
      total += spend;
      totalRevenue += revenue;
    }
  }
  if (total <= 0) return null;

  const channelRoas = ratio(totalRevenue, total);
  const out = new Map<FunnelStage, StageSplit>();
  for (const [stage, e] of byStage) {
    const stageRoas = ratio(e.revenue, e.spend);
    out.set(stage, {
      share: e.spend / total,
      roasIndex: channelRoas && stageRoas ? stageRoas / channelRoas : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- budget scaling

function brandKpi(profile: CampaignProfile, s: ChannelStats): number | null {
  switch (PROFILE_KPI[profile]) {
    case "roas": return ratio(s.revenue, s.spend);
    case "cpv": return ratio(s.spend, s.views);
    case "cpl": return ratio(s.spend, s.leads);
    case "cpi": return ratio(s.spend, s.installs);
    case "cpm": return s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null;
  }
}

function kpiTarget(profile: CampaignProfile, brand: BrandConfig): number | null {
  switch (PROFILE_KPI[profile]) {
    case "roas": return brand.targetRoas > 0 ? brand.targetRoas : null;
    case "cpv": return brand.targetCpv ?? null;
    case "cpl": return brand.targetCpl ?? null;
    case "cpi": return brand.targetCpi ?? null;
    case "cpm": return null;
  }
}

// Performance vs target, normalised so >1 always means "ahead of goal".
function performanceIndex(profile: CampaignProfile, value: number | null, target: number | null): number | null {
  if (value == null || target == null || value <= 0 || target <= 0) return null;
  return PROFILE_KPI[profile] === "roas" ? value / target : target / value;
}

// Scale the baseline by how far performance sits from goal. Deliberately conservative:
// at most +20% a month, at most −15%, so a plan never whipsaws a client's spend.
function scaleFor(index: number | null): { factor: number; reason: string } {
  if (index == null) return { factor: 1, reason: "אין יעד KPI מוגדר — התקציב נשמר ברמת החודש הקודם." };
  if (index >= 1.25) return { factor: 1.2, reason: `ביצועים ${Math.round((index - 1) * 100)}% מעל היעד — מומלץ סקייל של 20%.` };
  if (index >= 1.1) return { factor: 1.1, reason: `ביצועים ${Math.round((index - 1) * 100)}% מעל היעד — מומלץ סקייל של 10%.` };
  if (index >= 0.95) return { factor: 1, reason: "ביצועים בטווח היעד — שמירה על אותו תקציב." };
  if (index >= 0.8) return { factor: 0.9, reason: `ביצועים ${Math.round((1 - index) * 100)}% מתחת ליעד — הפחתה של 10% עד לייצוב.` };
  return { factor: 0.85, reason: `ביצועים ${Math.round((1 - index) * 100)}% מתחת ליעד — הפחתה של 15% והתמקדות בערוצים הרווחיים.` };
}

// ---------------------------------------------------------------- allocation

interface Cell {
  channel: AdChannel;
  stage: FunnelStage;
  prevSpend: number; // over the lookback (ILS)
  weight: number;
  eff: number; // efficiency vs target (1 = on goal)
  stats: ChannelStats; // the channel's rates, used for the forecast
  roasIndex: number | null;
}

// Bounded normalisation: every cell gets at least MIN_CELL_SHARE and at most MAX_CELL_SHARE.
function boundShares(weights: number[]): number[] {
  const n = weights.length;
  if (!n) return [];
  const total = weights.reduce((s, w) => s + w, 0);
  let shares = total > 0 ? weights.map((w) => w / total) : weights.map(() => 1 / n);
  const min = Math.min(MIN_CELL_SHARE, 1 / n);
  const max = Math.max(MAX_CELL_SHARE, 1 / n);
  for (let i = 0; i < 4; i++) {
    const clamped = shares.map((s) => clamp(s, min, max));
    const sum = clamped.reduce((s, v) => s + v, 0);
    shares = clamped.map((s) => s / sum);
  }
  return shares;
}

function forecastFor(profile: CampaignProfile, budget: number, s: ChannelStats, roasIndex: number | null): PlanForecast {
  const cpm = s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null;
  const cpc = ratio(s.spend, s.clicks);
  const cpa = ratio(s.spend, s.purchases);
  const cpv = ratio(s.spend, s.views);
  const cpl = ratio(s.spend, s.leads);
  const cpi = ratio(s.spend, s.installs);
  const baseRoas = ratio(s.revenue, s.spend);
  const roas = baseRoas == null ? null : baseRoas * (roasIndex ?? 1);

  const impressions = cpm ? (budget / cpm) * 1000 : null;
  const clicks = cpc ? budget / cpc : null;
  const isEcom = profile === "ecommerce";
  return {
    impressions: impressions == null ? null : Math.round(impressions),
    clicks: clicks == null ? null : Math.round(clicks),
    purchases: isEcom && cpa ? Math.round(budget / cpa) : null,
    revenue: isEcom && roas ? Math.round(budget * roas) : null,
    roas: isEcom ? roas : null,
    views: profile === "views" && cpv ? Math.round(budget / cpv) : null,
    leads: profile === "leads" && cpl ? Math.round(budget / cpl) : null,
    installs: profile === "app" && cpi ? Math.round(budget / cpi) : null,
    cpm, cpc, cpa, cpv, cpl, cpi,
  };
}

// Round line budgets to ROUND_TO and push the rounding remainder onto the largest line, so the
// lines always add up to exactly the plan total.
function settleRounding(budgets: number[], total: number): number[] {
  const rounded = budgets.map((b) => Math.max(0, round(b)));
  const diff = total - rounded.reduce((s, b) => s + b, 0);
  if (diff !== 0 && rounded.length) {
    let big = 0;
    for (let i = 1; i < rounded.length; i++) if (rounded[i] > rounded[big]) big = i;
    rounded[big] = Math.max(0, rounded[big] + diff);
  }
  return rounded;
}

// ---------------------------------------------------------------- the builder

export async function buildMediaPlan(
  brand: BrandConfig,
  month: string,
  opts: { budgetOverride?: number; asOf?: string } = {},
): Promise<MediaPlanDraft> {
  const profile = campaignProfileOf(brand);
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const to = shiftDate(monthStart, -1); // plan on data up to the day before the month starts
  const from = shiftDate(to, -(LOOKBACK_DAYS - 1));

  const [stats, prevMonthSpend, usdIls] = await Promise.all([
    channelStats(brand.id, from, to),
    (async () => {
      const pm = monthBounds(prevMonthOf(month));
      return spendBetween(brand.id, pm.start, pm.end);
    })(),
    fetchUsdIlsRate(),
  ]);

  const channels = planChannels(brand);
  const lookbackSpend = [...stats.values()].reduce((s, c) => s + c.spend, 0);

  // Baseline: last full month's spend; fall back to the lookback run-rate, then to the
  // configured monthly budget, so a brand with thin history still gets a sane plan.
  const runRate = lookbackSpend / (LOOKBACK_DAYS / 30);
  const baselineBudget = round(prevMonthSpend > 0 ? prevMonthSpend : runRate > 0 ? runRate : brand.monthlyBudget);

  // Brand-level KPI over the lookback → scale decision.
  const totals = [...stats.values()].reduce((acc, c) => {
    acc.spend += c.spend; acc.revenue += c.revenue; acc.purchases += c.purchases;
    acc.impressions += c.impressions; acc.clicks += c.clicks;
    acc.views += c.views; acc.leads += c.leads; acc.installs += c.installs;
    return acc;
  }, emptyStats("meta"));
  const kpi = PROFILE_KPI[profile];
  const kpiValue = brandKpi(profile, totals);
  const target = kpiTarget(profile, brand);
  const index = performanceIndex(profile, kpiValue, target);
  const { factor, reason } = scaleFor(index);
  const recommendedBudget = round(Math.max(0, baselineBudget * factor));

  const budgetSource: "fixed" | "proposed" = brand.monthlyBudget > 0 ? "fixed" : "proposed";
  const totalBudget = round(
    opts.budgetOverride && opts.budgetOverride > 0
      ? opts.budgetOverride
      : budgetSource === "fixed"
        ? brand.monthlyBudget
        : recommendedBudget,
  );

  // Funnel split per channel (campaign names). Any channel Windsor can't answer for is
  // planned as a single default stage rather than dropped.
  const splits = await Promise.all(
    channels.map(async (c) => ({
      channel: c.id,
      split: stats.get(c.id)?.spend ? await stageSplit(brand, profile, c, from, to, usdIls) : null,
    })),
  );
  const stageSource: PlanBasis["stageSource"] = splits.some((s) => s.split) ? "windsor" : "channel-only";

  // Build the cell grid.
  const cells: Cell[] = [];
  for (const c of channels) {
    const s = stats.get(c.id);
    if (!s || s.spend <= 0) continue; // no history on this channel → nothing to base a line on
    const split = splits.find((x) => x.channel === c.id)?.split;
    const entries: [FunnelStage, StageSplit][] = split
      ? [...split.entries()]
      : [[DEFAULT_STAGE[profile][c.id], { share: 1, roasIndex: null }]];

    for (const [stage, sp] of entries) {
      const prevSpend = s.spend * sp.share;
      if (prevSpend <= 0) continue;
      // Efficiency: for ecommerce we know each stage's own ROAS; elsewhere the channel's KPI
      // stands in for its stages. Bounded so one great month can't hoover up the budget.
      const cellKpi = profile === "ecommerce" && sp.roasIndex != null
        ? (ratio(s.revenue, s.spend) ?? 0) * sp.roasIndex
        : brandKpi(profile, s);
      const cellIndex = performanceIndex(profile, cellKpi, target);
      const eff = clamp(cellIndex ?? 1, 0.6, 1.5);
      cells.push({ channel: c.id, stage, prevSpend, weight: (prevSpend / (lookbackSpend || 1)) * eff, eff, stats: s, roasIndex: sp.roasIndex });
    }
  }

  // No history at all: split evenly across the brand's configured channels, one stage each.
  if (!cells.length) {
    for (const c of channels) {
      const s = stats.get(c.id) ?? emptyStats(c.id);
      cells.push({ channel: c.id, stage: DEFAULT_STAGE[profile][c.id], prevSpend: 0, weight: 1, eff: 1, stats: s, roasIndex: null });
    }
  }

  const shares = boundShares(cells.map((c) => c.weight));
  const budgets = settleRounding(shares.map((sh) => sh * totalBudget), totalBudget);

  const stageOrder = PROFILE_STAGES[profile];
  const lines: PlanLine[] = cells
    .map((c, i) => {
      const budget = budgets[i];
      const prevMonthly = c.prevSpend / (LOOKBACK_DAYS / 30); // lookback → one month
      const deltaPct = prevMonthly > 0 ? Math.round(((budget - prevMonthly) / prevMonthly) * 100) : null;
      return {
        channel: c.channel,
        channelLabel: CHANNEL_LABEL[c.channel],
        stage: c.stage,
        stageLabel: STAGE_LABEL[c.stage],
        budget,
        sharePct: totalBudget > 0 ? Math.round((budget / totalBudget) * 1000) / 10 : 0,
        prevSpend: Math.round(prevMonthly),
        deltaPct,
        forecast: forecastFor(profile, budget, c.stats, c.roasIndex),
        note: lineNote(profile, c, deltaPct),
      };
    })
    .sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || b.budget - a.budget);

  const basis: PlanBasis = {
    from,
    to,
    lookbackDays: LOOKBACK_DAYS,
    stageSource,
    channels: channels.map((c) => {
      const s = stats.get(c.id);
      return { channel: c.id, spend: Math.round(s?.spend ?? 0), kpi: s ? brandKpi(profile, s) : null };
    }),
  };

  const draft: MediaPlanDraft = {
    brandId: brand.id,
    brandName: brand.name,
    brandNameHe: brand.nameHe,
    month,
    monthStart,
    monthEnd,
    profile,
    budgetSource,
    totalBudget,
    baselineBudget,
    recommendedBudget,
    scale: { factor, kpi, kpiValue, kpiTarget: target, index, reason },
    lines,
    rationale: [],
    basis,
  };
  draft.rationale = baseRationale(draft);
  return draft;
}

function lineNote(profile: CampaignProfile, c: Cell, deltaPct: number | null): string {
  const dir = deltaPct == null ? "" : deltaPct > 3 ? `+${deltaPct}% מול החודש האחרון` : deltaPct < -3 ? `${deltaPct}% מול החודש האחרון` : "ללא שינוי מהותי";
  if (c.prevSpend <= 0) return "ערוץ ללא היסטוריה — תקציב בדיקה";
  if (c.eff >= 1.15) return `ביצועים מעל היעד · ${dir}`;
  if (c.eff <= 0.85) return `ביצועים מתחת ליעד · ${dir}`;
  return dir || "שמירה על הקצב הנוכחי";
}

// Deterministic bullets, straight from the plan's own numbers. The LLM narrative
// (mediaPlanNarrative.ts) replaces these when ANTHROPIC_API_KEY is configured.
function baseRationale(d: MediaPlanDraft): string[] {
  const ils = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const out: string[] = [];
  out.push(
    d.budgetSource === "fixed"
      ? `תקציב קבוע של ${ils(d.totalBudget)} לחודש ${d.month}. לפי הביצועים, ההמלצה היא ${ils(d.recommendedBudget)}.`
      : `תקציב מוצע של ${ils(d.totalBudget)} לחודש ${d.month}, מבוסס על ${ils(d.baselineBudget)} בחודש הקודם.`,
  );
  out.push(d.scale.reason);
  const top = d.lines[0];
  if (top) out.push(`הקצאה מובילה: ${top.channelLabel} · ${top.stageLabel} — ${ils(top.budget)} (${top.sharePct}%).`);
  const grown = d.lines.filter((l) => (l.deltaPct ?? 0) >= 10).slice(0, 2);
  for (const l of grown) out.push(`הגדלה ב-${l.channelLabel} · ${l.stageLabel}: ${ils(l.prevSpend)} → ${ils(l.budget)}.`);
  const cut = d.lines.filter((l) => (l.deltaPct ?? 0) <= -10).slice(0, 2);
  for (const l of cut) out.push(`הפחתה ב-${l.channelLabel} · ${l.stageLabel}: ${ils(l.prevSpend)} → ${ils(l.budget)}.`);
  if (d.basis.stageSource === "channel-only") out.push("פילוח הפאנל לא היה זמין מנתוני הקמפיינים — הפריסה ברמת ערוץ בלבד.");
  return out;
}
