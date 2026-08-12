// Applies the planning rules (mediaPlanRules.ts) to a brand's data and returns next month's
// plan: channel × funnel stage, budget + forecast.
//
// This module holds NO planning judgement. Every threshold, band, ladder and pattern comes from
// the rules file; what happens here is only the mechanics of applying them:
//
//   1. lookback   — 90 days of the brand's own data
//   2. budget     — fixed (from brands.ts) or proposed (baseline × scale × seasonality)
//   3. allocation — funnel stage bands first, then the channel split inside each stage
//   4. forecast   — each line's own historical rates, applied to its new budget
//
// Two data sources, each used for what it is good at:
//   • daily_metrics (DB)  — per-channel spend/KPIs, already ILS-normalised by the ingester.
//     Drives the baseline budget, every rate in the forecast, and the channel-level performance.
//   • Windsor (campaigns) — campaign names over the same window, used ONLY to split a channel's
//     spend into funnel stages (and, for ecommerce, to tell how each stage performed).
//     If Windsor is unavailable the plan still builds, at channel level.
import { explorerChannels, campaignProfileOf, type BrandConfig, type CampaignProfile } from "./brands";
import { CHANNEL_FIELDS } from "./channelFields";
import { DIMENSION_FIELDS } from "./breakdowns";
import { fetchWindsor, num } from "./windsor";
import { fetchUsdIlsRate, toIls } from "./fx";
import { getSupabase, hasDb } from "./db";
import { shiftDate } from "./dates";
import { getEconomics } from "./economicsStore";
import { deriveEconomics, type UnitEconomics } from "./unitEconomics";
import {
  CHANNEL_LABEL,
  GUARDRAILS,
  MIN_BUDGET_RULE,
  RULES_VERSION,
  STAGE_LABEL,
  classifyStage,
  defaultStageFor,
  effectiveRoasTarget,
  MIN_TARGET_ROAS,
  performanceIndex,
  profileRules,
  profileStages,
  minLineBudgetFor,
  runnableChannels,
  scaleStepFor,
  seasonalityFor,
  stageRule,
  type AdChannel,
  type FunnelStage,
  type PlanKpi,
} from "./mediaPlanRules";

export type { AdChannel, FunnelStage, PlanKpi };

export interface PlanForecast {
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  revenue: number | null;
  roas: number | null;
  views: number | null; // qualified (15s / ThruPlay) views
  completedViews: number | null; // 100% completions
  viewRate: number | null; // qualified views ÷ impressions — the rate that should be climbing
  completionRate: number | null; // completions ÷ qualified views
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
  prevSpend: number; // the same cell's spend last month (ILS), from the lookback run-rate
  deltaPct: number | null; // budget vs prevSpend
  trusted: boolean; // was there enough data to let this cell's performance move money?
  seeded: boolean; // a stage the client isn't running, opened by the rules
  floorUsed: number; // the minimum monthly budget this line had to clear to survive
  forecast: PlanForecast;
  note: string; // why this line moved up or down
}

export interface PlanBasis {
  from: string;
  to: string;
  lookbackDays: number;
  stageSource: "windsor" | "channel-only"; // did the funnel split come from campaign names?
  rulesVersion: string;
  channels: { channel: AdChannel; spend: number; kpi: number | null }[];
}

export interface ScaleDecision {
  factor: number; // scale ladder × seasonality, applied to the baseline
  scaleFactor: number; // the ladder step on its own
  seasonalFactor: number;
  kpi: PlanKpi;
  kpiValue: number | null;
  kpiTarget: number | null;
  // Where the target came from: the client's own unit economics, a number typed into brands.ts,
  // or nothing at all (in which case the budget is held flat).
  targetSource: "unit-economics" | "configured" | "none";
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
  roasFloorApplied: boolean; // the ROAS target was below MIN_TARGET_ROAS and was raised to it
  // Lines the budget could not fund were dropped, and the surviving stages no longer fit inside
  // their share bands. The minimum-line rule won; the plan says so rather than presenting an
  // out-of-band split as doctrine.
  bandsRelaxed: boolean;
  droppedLines: number;
  // The plan's own budget cannot fund a single line at its platform minimum. The line is kept
  // anyway (a plan with nothing in it helps no one), but this is the headline for the manager:
  // the client is underfunded for the channel mix their profile implies.
  underfunded: boolean;
  // The client's unit economics, when collected — the derivation behind an ecommerce target.
  economics: (UnitEconomics & { derived: ReturnType<typeof deriveEconomics> }) | null;
  economicsMissing: boolean; // an ecommerce client with no economics on file yet
  lines: PlanLine[];
  rationale: string[];
  basis: PlanBasis;
}

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step = GUARDRAILS.roundTo) => Math.round(v / step) * step;
const sumOf = <T,>(a: T[], f: (t: T) => number) => a.reduce((s, t) => s + f(t), 0);

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
  views: number; // qualified views — Meta ThruPlay (15s), TikTok 6s, Google video_views
  completed: number; // 100% completions
  leads: number;
  installs: number;
}

const emptyStats = (channel: AdChannel): ChannelStats => ({
  channel, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, views: 0, completed: 0, leads: 0, installs: 0,
});

async function channelStats(brandId: string, from: string, to: string): Promise<Map<AdChannel, ChannelStats>> {
  const out = new Map<AdChannel, ChannelStats>();
  if (!hasDb()) return out;
  const { data, error } = await getSupabase()
    .from("daily_metrics")
    .select("channel,spend_ils,revenue_ils,purchases,impressions,clicks,views,completed_views,leads,installs")
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
    e.completed += Number(r.completed_views);
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

// The KPI a client type is judged on, computed off a stats bundle.
function kpiOf(profile: CampaignProfile, s: ChannelStats): number | null {
  switch (profileRules(profile).kpi) {
    case "roas": return ratio(s.revenue, s.spend);
    case "cpv": return ratio(s.spend, s.views);
    case "cpl": return ratio(s.spend, s.leads);
    case "cpi": return ratio(s.spend, s.installs);
    case "cpm": return s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null;
  }
}

function kpiTarget(profile: CampaignProfile, brand: BrandConfig, derivedRoas: number | null): number | null {
  switch (profileRules(profile).kpi) {
    // The client's own economics win when they exist — that is where a ROAS goal belongs.
    case "roas": return effectiveRoasTarget(derivedRoas ?? brand.targetRoas).target;
    case "cpv": return brand.targetCpv ?? null;
    case "cpl": return brand.targetCpl ?? null;
    case "cpi": return brand.targetCpi ?? null;
    case "cpm": return null;
  }
}

// What one conversion costs on this channel, by the profile's KPI. This is what the minimum-line
// rule is priced against: 50 of these is the smallest budget worth planning.
function costPerConversion(profile: CampaignProfile, s: ChannelStats): number | null {
  const conv = conversionsOf(profile, s);
  return conv > 0 ? s.spend / conv : null;
}

// The conversion count behind a KPI — the data-sufficiency test needs the denominator, not the ratio.
function conversionsOf(profile: CampaignProfile, s: ChannelStats): number {
  switch (profileRules(profile).kpi) {
    case "roas": return s.purchases;
    case "cpv": return s.views;
    case "cpl": return s.leads;
    case "cpi": return s.installs;
    case "cpm": return s.impressions;
  }
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
      if (!stage) continue; // this channel has no place in the client type's funnel
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

// ---------------------------------------------------------------- allocation

interface Cell {
  channel: AdChannel;
  stage: FunnelStage;
  prevSpend: number; // over the lookback (ILS)
  weight: number; // prevSpend × efficiency
  eff: number; // performance vs target, clamped (1 = neutral)
  trusted: boolean; // did the cell clear the data-sufficiency bar?
  seeded: boolean; // opened by the rules rather than observed in the data
  floor: number; // the smallest monthly budget worth planning here (50 × cost per conversion)
  stats: ChannelStats; // the channel's rates, used for the forecast
  roasIndex: number | null;
}

// Normalise `raw` into shares that respect per-entry [min, max] bands. Bands that cannot all be
// satisfied (floors summing past 1, caps summing under 1) are relaxed proportionally rather than
// producing an unsolvable system.
function boundedShares(raw: number[], bands: { min: number; max: number }[]): number[] {
  const n = raw.length;
  if (!n) return [];
  const floorSum = sumOf(bands, (b) => b.min);
  const mins = floorSum > 0.9 ? bands.map((b) => (b.min / floorSum) * 0.9) : bands.map((b) => b.min);
  const capSum = sumOf(bands, (b) => b.max);
  const maxs = capSum < 1 ? bands.map(() => 1) : bands.map((b) => b.max);

  const total = sumOf(raw, (w) => w);
  let shares = total > 0 ? raw.map((w) => w / total) : raw.map(() => 1 / n);
  for (let i = 0; i < 8; i++) {
    const c = shares.map((s, j) => clamp(s, mins[j], maxs[j]));
    const sum = sumOf(c, (v) => v);
    shares = c.map((s) => s / sum);
  }
  return shares;
}

// Two-level allocation, in the order the doctrine states it:
//   1. how much each funnel STAGE gets — recent spend tilted by performance, inside the stage's
//      band from the rules;
//   2. how that stage's money splits across the CHANNELS running it, bounded so a stage never
//      collapses onto one platform.
// `active` marks the cells still in the plan — a line dropped for being under its platform's
// minimum is excluded, and the bands are then recomputed over what is left. Recomputing is the
// point: redistributing a dropped line's budget without re-checking the bands is how a stage ends
// up over its cap.
function allocateShares(cells: Cell[], profile: CampaignProfile, active: boolean[]): number[] {
  const out = new Array<number>(cells.length).fill(0);
  const liveIdx = cells.map((_, i) => i).filter((i) => active[i]);
  if (!liveIdx.length) return out;

  const stages = [...new Set(liveIdx.map((i) => cells[i].stage))];
  const rawStage = stages.map((st) => sumOf(liveIdx.filter((i) => cells[i].stage === st), (i) => cells[i].weight));
  const bands = stages.map((st) => {
    const r = stageRule(profile, st);
    return r ? { min: r.minShare, max: r.maxShare } : { min: 0, max: 1 };
  });
  // No usable history anywhere → plan from the rules' default shares instead of an even split.
  const seed = rawStage.some((w) => w > 0)
    ? rawStage
    : stages.map((st) => stageRule(profile, st)?.defaultShare ?? 1);
  const stageShare = boundedShares(seed, bands);

  const within = GUARDRAILS.withinStageChannelShare;
  stages.forEach((st, si) => {
    const idx = liveIdx.filter((i) => cells[i].stage === st);
    const w = idx.map((i) => cells[i].weight);
    const inner = idx.length === 1
      ? [1]
      : boundedShares(w, idx.map(() => ({ min: within.min, max: within.max })));
    idx.forEach((i, k) => {
      out[i] = stageShare[si] * inner[k];
    });
  });
  return out;
}

// Did the surviving stages end up outside their caps? Only possible when lines were dropped for
// being unfundable and the remaining stages' caps can no longer cover the whole budget.
function bandsBreached(cells: Cell[], profile: CampaignProfile, shares: number[], active: boolean[]): boolean {
  const stages = [...new Set(cells.filter((_, i) => active[i]).map((c) => c.stage))];
  return stages.some((st) => {
    const rule = stageRule(profile, st);
    if (!rule) return false;
    const share = sumOf(cells.map((c, i) => (active[i] && c.stage === st ? shares[i] : 0)), (v) => v);
    return share > rule.maxShare + 0.01;
  });
}

// Turn the cell grid into budgets.
//
// Allocation and affordability are solved TOGETHER, not one after the other: drop the cheapest
// line that cannot clear its platform's floor, then re-run the whole band allocation over what
// survives, and repeat. Redistributing a dropped line's budget across the others without
// re-applying the bands is what let a stage sail past its cap on the small accounts.
//
// The two rules can genuinely conflict: once enough lines are unfundable, the surviving stages'
// caps may no longer add up to the whole budget. The minimum wins — a line that cannot run is
// worse than a cap breach — and `bandsRelaxed` records that it happened so the plan can say so
// instead of quietly presenting an out-of-band split as if it were the doctrine.
function toBudgets(
  cells: Cell[],
  profile: CampaignProfile,
  total: number,
): { budgets: number[]; bandsRelaxed: boolean; dropped: number; underfunded: boolean } {
  if (!cells.length || total <= 0) return { budgets: cells.map(() => 0), bandsRelaxed: false, dropped: 0, underfunded: false };

  const active = cells.map(() => true);
  let shares = allocateShares(cells, profile, active);

  for (let guard = 0; guard < cells.length; guard++) {
    const under = cells
      .map((c, i) => ({ i, budget: shares[i] * total }))
      .filter((x) => active[x.i] && x.budget > 0 && x.budget < cells[x.i].floor)
      .sort((a, b) => a.budget - b.budget);
    if (!under.length) break;
    // Never drop the last line standing — a plan with no lines is worse than an underfunded one.
    if (active.filter(Boolean).length <= 1) break;
    active[under[0].i] = false;
    shares = allocateShares(cells, profile, active);
  }

  const dropped = active.filter((a) => !a).length;
  const bandsRelaxed = bandsBreached(cells, profile, shares, active);
  // Did we stop dropping because only one line was left, and even that one is unfundable?
  const underfunded = cells.some((c, i) => active[i] && shares[i] * total > 0 && shares[i] * total < c.floor);

  const norm = sumOf(shares, (s) => s);
  const live = norm > 0 ? shares.map((s) => s / norm) : shares;
  const budgets = live.map((s) => Math.max(0, round(s * total)));
  const diff = total - sumOf(budgets, (b) => b);
  if (diff !== 0) {
    let big = 0;
    for (let i = 1; i < budgets.length; i++) if (budgets[i] > budgets[big]) big = i;
    budgets[big] = Math.max(0, budgets[big] + diff);
  }
  return { budgets, bandsRelaxed, dropped, underfunded };
}

function forecastFor(profile: CampaignProfile, budget: number, s: ChannelStats, roasIndex: number | null): PlanForecast {
  const cpm = s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null;
  const cpc = ratio(s.spend, s.clicks);
  const cpa = ratio(s.spend, s.purchases);
  const cpv = ratio(s.spend, s.views); // cost per qualified (15s) view
  const cpl = ratio(s.spend, s.leads);
  const cpi = ratio(s.spend, s.installs);
  const baseRoas = ratio(s.revenue, s.spend);
  const roas = baseRoas == null ? null : baseRoas * (roasIndex ?? 1);

  const isEcom = profile === "ecommerce";
  return {
    impressions: cpm ? Math.round((budget / cpm) * 1000) : null,
    clicks: cpc ? Math.round(budget / cpc) : null,
    purchases: isEcom && cpa ? Math.round(budget / cpa) : null,
    revenue: isEcom && roas ? Math.round(budget * roas) : null,
    roas: isEcom ? roas : null,
    views: profile === "views" && cpv ? Math.round(budget / cpv) : null,
    completedViews: profile === "views" && cpv && s.views > 0 ? Math.round((budget / cpv) * (s.completed / s.views)) : null,
    viewRate: profile === "views" ? ratio(s.views, s.impressions) : null,
    completionRate: profile === "views" ? ratio(s.completed, s.views) : null,
    leads: profile === "leads" && cpl ? Math.round(budget / cpl) : null,
    installs: profile === "app" && cpi ? Math.round(budget / cpi) : null,
    cpm, cpc, cpa, cpv, cpl, cpi,
  };
}

// ---------------------------------------------------------------- the builder

export async function buildMediaPlan(
  brand: BrandConfig,
  month: string,
  opts: { budgetOverride?: number } = {},
): Promise<MediaPlanDraft> {
  const profile = campaignProfileOf(brand);
  const rules = profileRules(profile);
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const to = shiftDate(monthStart, -1); // plan on data up to the day before the month starts
  const from = shiftDate(to, -(GUARDRAILS.lookbackDays - 1));
  const monthsInLookback = GUARDRAILS.lookbackDays / 30;

  const [stats, prevMonthSpend, usdIls, economicsRow] = await Promise.all([
    channelStats(brand.id, from, to),
    (async () => {
      const pm = monthBounds(prevMonthOf(month));
      return spendBetween(brand.id, pm.start, pm.end);
    })(),
    fetchUsdIlsRate(),
    profile === "ecommerce" ? getEconomics(brand.id).catch(() => null) : Promise.resolve(null),
  ]);

  // An ecommerce ROAS target is arithmetic on the client's economics, not a media opinion.
  const derived = economicsRow ? deriveEconomics(economicsRow) : null;
  const economics = economicsRow && derived ? { ...economicsRow, derived } : null;
  const derivedRoas = derived?.viable ? derived.targetRoas : null;

  const channels = planChannels(brand);
  const lookbackSpend = sumOf([...stats.values()], (c) => c.spend);

  // --- 1. budget -----------------------------------------------------------------------------
  // Baseline: last full month's spend; fall back to the lookback run-rate, then to the
  // configured monthly budget, so a brand with thin history still gets a sane plan.
  const runRate = lookbackSpend / monthsInLookback;
  const baselineBudget = round(prevMonthSpend > 0 ? prevMonthSpend : runRate > 0 ? runRate : brand.monthlyBudget);

  const totals = [...stats.values()].reduce((acc, c) => {
    acc.spend += c.spend; acc.revenue += c.revenue; acc.purchases += c.purchases;
    acc.impressions += c.impressions; acc.clicks += c.clicks;
    acc.views += c.views; acc.completed += c.completed; acc.leads += c.leads; acc.installs += c.installs;
    return acc;
  }, emptyStats("meta"));
  const kpiValue = kpiOf(profile, totals);
  const target = kpiTarget(profile, brand, derivedRoas);
  const targetSource: ScaleDecision["targetSource"] =
    target == null ? "none" : profile === "ecommerce" && derivedRoas != null ? "unit-economics" : "configured";
  const index = performanceIndex(rules.kpi, kpiValue, target);
  const step = scaleStepFor(index);
  const season = seasonalityFor(month);
  const combinedFactor = step.factor * season.factor;
  const recommendedBudget = round(Math.max(0, baselineBudget * combinedFactor));

  const budgetSource: "fixed" | "proposed" = brand.monthlyBudget > 0 ? "fixed" : "proposed";
  const totalBudget = round(
    opts.budgetOverride && opts.budgetOverride > 0
      ? opts.budgetOverride
      : budgetSource === "fixed"
        ? brand.monthlyBudget
        : recommendedBudget,
  );

  // --- 2. funnel split -----------------------------------------------------------------------
  const splits = await Promise.all(
    channels.map(async (c) => ({
      channel: c.id,
      split: stats.get(c.id)?.spend ? await stageSplit(brand, profile, c, from, to, usdIls) : null,
    })),
  );
  const stageSource: PlanBasis["stageSource"] = splits.some((s) => s.split) ? "windsor" : "channel-only";

  const cells: Cell[] = [];
  for (const c of channels) {
    const s = stats.get(c.id);
    if (!s || s.spend <= 0) continue; // no history on this channel → nothing to base a line on
    const split = splits.find((x) => x.channel === c.id)?.split;
    const fallbackStage = defaultStageFor(profile, c.id);
    const entries: [FunnelStage, StageSplit][] = split
      ? [...split.entries()]
      : fallbackStage
        ? [[fallbackStage, { share: 1, roasIndex: null }]]
        : [];

    for (const [stage, sp] of entries) {
      const prevSpend = s.spend * sp.share;
      if (prevSpend <= 0) continue;
      // A cell's own performance only moves money once there is enough of it to mean anything;
      // below the sufficiency bar the cell is planned at neutral efficiency.
      const suff = GUARDRAILS.dataSufficiency;
      const trusted = prevSpend >= suff.minSpend && conversionsOf(profile, s) * sp.share >= suff.minConversions;
      const cellKpi = profile === "ecommerce" && sp.roasIndex != null
        ? (ratio(s.revenue, s.spend) ?? 0) * sp.roasIndex
        : kpiOf(profile, s);
      const cellIndex = trusted ? performanceIndex(rules.kpi, cellKpi, target) : null;
      const eff = clamp(cellIndex ?? 1, GUARDRAILS.efficiency.min, GUARDRAILS.efficiency.max);
      cells.push({
        channel: c.id, stage, prevSpend, weight: prevSpend * eff, eff, trusted, seeded: false,
        floor: minLineBudgetFor(c.id, profile, costPerConversion(profile, s)),
        stats: s, roasIndex: sp.roasIndex,
      });
    }
  }

  // Open the funnel stages the client isn't running. A stage with no cell can't be held to its
  // floor, which is what lets one stage legitimately take the whole plan — seeding it at weight
  // zero lets the band clamp in allocateShares pull it up to its minimum. The stage opens on the
  // configured channel best suited to run it (most spend among the channels the rules allow).
  if (GUARDRAILS.openMissingStages && cells.length) {
    for (const rule of rules.stages) {
      if (cells.some((c) => c.stage === rule.stage)) continue;
      const runnable = runnableChannels(profile, rule.stage);
      const candidates = channels.filter((c) => runnable.includes(c.id));
      if (!candidates.length) continue; // no connected channel can run this stage
      const best = candidates.reduce((a, b) => ((stats.get(b.id)?.spend ?? 0) > (stats.get(a.id)?.spend ?? 0) ? b : a));
      cells.push({
        channel: best.id,
        stage: rule.stage,
        prevSpend: 0,
        weight: 0,
        eff: 1,
        trusted: false,
        seeded: true,
        floor: minLineBudgetFor(best.id, profile, costPerConversion(profile, stats.get(best.id) ?? emptyStats(best.id))),
        stats: stats.get(best.id) ?? emptyStats(best.id),
        roasIndex: null,
      });
    }
  }

  // No history at all: one line per stage the brand's channels can run, split by the rules'
  // default shares.
  if (!cells.length) {
    for (const rule of rules.stages) {
      const runnable = runnableChannels(profile, rule.stage);
      const candidates = channels.filter((c) => runnable.includes(c.id));
      if (!candidates.length) continue;
      cells.push({
        channel: candidates[0].id,
        stage: rule.stage,
        prevSpend: 0,
        weight: 0,
        eff: 1,
        trusted: false,
        seeded: true,
        floor: minLineBudgetFor(candidates[0].id, profile, null), // no history → the no-data floor
        stats: stats.get(candidates[0].id) ?? emptyStats(candidates[0].id),
        roasIndex: null,
      });
    }
  }

  // --- 3. allocation -------------------------------------------------------------------------
  const { budgets, bandsRelaxed, dropped: droppedLines, underfunded } = toBudgets(cells, profile, totalBudget);

  const order = profileStages(profile);
  const lines: PlanLine[] = cells
    .map((c, i) => {
      const budget = budgets[i];
      const prevMonthly = c.prevSpend / monthsInLookback; // lookback → one month
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
        trusted: c.trusted,
        seeded: c.seeded,
        floorUsed: c.floor,
        forecast: forecastFor(profile, budget, c.stats, c.roasIndex),
        note: lineNote(c, deltaPct),
      };
    })
    .filter((l) => l.budget > 0) // lines folded away by the minimum-budget rule
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || b.budget - a.budget);

  const roasFloorRaised = profile === "ecommerce" && effectiveRoasTarget(derivedRoas ?? brand.targetRoas).raised;
  const reason = season.enabled && season.factor !== 1
    ? `${step.label} · התאמה עונתית ל${season.note}: ×${season.factor}`
    : season.note
      ? `${step.label} · ${season.note} (העונתיות כבויה — לא הוחלה על התקציב)`
      : step.label;

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
    scale: { factor: combinedFactor, scaleFactor: step.factor, seasonalFactor: season.factor, kpi: rules.kpi, kpiValue, kpiTarget: target, targetSource, index, reason },
    roasFloorApplied: roasFloorRaised,
    bandsRelaxed,
    droppedLines,
    underfunded,
    economics,
    economicsMissing: profile === "ecommerce" && !economics,
    lines,
    rationale: [],
    basis: {
      from,
      to,
      lookbackDays: GUARDRAILS.lookbackDays,
      stageSource,
      rulesVersion: RULES_VERSION,
      channels: channels.map((c) => {
        const s = stats.get(c.id);
        return { channel: c.id, spend: Math.round(s?.spend ?? 0), kpi: s ? kpiOf(profile, s) : null };
      }),
    },
  };
  draft.rationale = baseRationale(draft, lookbackSpend);
  return draft;
}

function lineNote(c: Cell, deltaPct: number | null): string {
  const dir = deltaPct == null ? "" : deltaPct > 3 ? `+${deltaPct}% מול החודש האחרון` : deltaPct < -3 ? `${deltaPct}% מול החודש האחרון` : "ללא שינוי מהותי";
  if (c.seeded) return "שלב שלא רץ החודש — נפתח לפי רצפת החוקים";
  if (c.prevSpend <= 0) return "ערוץ ללא היסטוריה — הקצאה לפי ברירת המחדל בחוקים";
  if (!c.trusted) return `אין מספיק דאטה להסקה — הקצאה לפי נפח בלבד · ${dir}`;
  if (c.eff >= 1.15) return `ביצועים מעל היעד · ${dir}`;
  if (c.eff <= 0.85) return `ביצועים מתחת ליעד · ${dir}`;
  return dir || "שמירה על הקצב הנוכחי";
}

// Deterministic bullets, straight from the plan's own numbers. The LLM narrative
// (mediaPlanNarrative.ts) replaces these when ANTHROPIC_API_KEY is configured.
function baseRationale(d: MediaPlanDraft, lookbackSpend: number): string[] {
  const ils = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const out: string[] = [];
  out.push(
    d.budgetSource === "fixed"
      ? `תקציב קבוע של ${ils(d.totalBudget)} לחודש ${d.month}. לפי הביצועים, ההמלצה היא ${ils(d.recommendedBudget)}.`
      : `תקציב מוצע של ${ils(d.totalBudget)} לחודש ${d.month}, מבוסס על ${ils(d.baselineBudget)} בחודש הקודם.`,
  );
  out.push(d.scale.reason);
  if (d.economics) {
    const e = d.economics.derived;
    out.push(
      `יעד ה-ROAS (${e.targetRoas}) נגזר מהיוניט אקונומיקס: תרומה של ${ils(e.contributionPerOrder)} להזמנה ` +
        `(${Math.round(e.contributionMarginPct * 100)}%), ROAS איזון ${e.breakEvenRoas}, CAC יעד ${ils(e.targetCac)}.`,
    );
  } else if (d.economicsMissing) {
    out.push("לא נאספו נתוני יוניט אקונומיקס — יעד ה-ROAS מוגדר ידנית ולא נגזר מרווחיות הלקוח.");
  }
  if (d.roasFloorApplied) {
    out.push(`יעד ה-ROAS המוגדר נמוך מהמינימום ${MIN_TARGET_ROAS} — הפריסה נבנתה מול ${MIN_TARGET_ROAS}.`);
  }
  const top = d.lines[0];
  if (top) out.push(`הקצאה מובילה: ${top.channelLabel} · ${top.stageLabel} — ${ils(top.budget)} (${top.sharePct}%).`);
  for (const l of d.lines.filter((l) => (l.deltaPct ?? 0) >= 10).slice(0, 2)) {
    out.push(`הגדלה ב-${l.channelLabel} · ${l.stageLabel}: ${ils(l.prevSpend)} → ${ils(l.budget)}.`);
  }
  for (const l of d.lines.filter((l) => (l.deltaPct ?? 0) <= -10).slice(0, 2)) {
    out.push(`הפחתה ב-${l.channelLabel} · ${l.stageLabel}: ${ils(l.prevSpend)} → ${ils(l.budget)}.`);
  }
  // The two-platform rule: with no cost-per-conversion history, each platform needs its no-data
  // floor. A budget under the pair's cost simply cannot be spread across two platforms.
  if (lookbackSpend <= 0 && d.totalBudget > 0 && d.totalBudget < MIN_BUDGET_RULE.twoPlatformMinimum) {
    out.push(
      `אין היסטוריית עלות להמרה, והתקציב (${ils(d.totalBudget)}) נמוך מ-${ils(MIN_BUDGET_RULE.twoPlatformMinimum)} — ` +
        "לא מספיק לשתי פלטפורמות. הפריסה מרכזת אותו בפלטפורמה אחת.",
    );
  }
  if (d.underfunded) {
    const need = d.lines.length ? Math.max(...d.lines.map((l) => l.floorUsed)) : 0;
    out.push(
      `התקציב (${ils(d.totalBudget)}) נמוך מהמינימום להרצת שורה אחת (${ils(need)}) — ` +
        "הפריסה מרוכזת בשורה אחת ומתחת לסף הלמידה. זו נקודה לשיחה עם הלקוח, לא בעיית פריסה.",
    );
  }
  if (d.bandsRelaxed) {
    out.push(
      `התקציב לא מאפשר לממן את כל שלבי הפאנל במינימום הנדרש — ${d.droppedLines} שורות בוטלו, ` +
        "ולכן החלוקה חורגת מרצועות ההקצאה. הגדלת התקציב תאפשר פריסה מלאה יותר.",
    );
  }
  if (d.basis.stageSource === "channel-only") out.push("פילוח הפאנל לא היה זמין מנתוני הקמפיינים — הפריסה ברמת ערוץ בלבד.");
  return out;
}
