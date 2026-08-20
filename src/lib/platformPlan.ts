// Per-platform plan-vs-execution for automotive awareness brands (Chery, Xpeng). Each plan line is
// one platform's flight commitment; we pull live Windsor actuals (ONLY campaigns whose name
// contains the brand's campaignFilter — e.g. "leaders"), convert USD→ILS, and compare planned vs
// actual spend / 15s-views (thruplay) / 100%-views, plus CPV and % of target met.

import type { BrandConfig, PlatformPlanLine } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { fetchUsdIlsRate, toIls } from "./fx";
import { today } from "./dates";

export interface PlatformActual {
  spend: number; // ILS
  impressions: number;
  reach: number;
  views: number; // shorter views (Meta 3s / TikTok 2s)
  thruplay: number; // 15s-views (Meta ThruPlay / TikTok 6s)
  completedViews: number; // 100%-views
}
export interface PlatformLineExecution {
  line: PlatformPlanLine;
  actual: PlatformActual;
  spendPct: number | null; // actual spend ÷ budget
  thruplayPct: number | null; // actual 15s-views ÷ target
  completedPct: number | null; // actual 100%-views ÷ target
  cpv: number | null; // actual: spend ÷ thruplay (cost per 15s view)
  planCpv: number | null; // planned: budget ÷ target thruplay
  cpCompleted: number | null; // actual: spend ÷ completed (cost per 100% view)
  connected: boolean; // any actual rows returned (false ⇒ platform not live/connected yet)
}
export interface PlatformPlanExecution {
  flightStart: string;
  flightEnd: string;
  asOf: string;
  elapsedDays: number;
  totalDays: number;
  lines: PlatformLineExecution[];
  totals: {
    budget: number; spend: number; thruplayTarget: number; thruplay: number; completedTarget: number; completedViews: number;
    spendPct: number | null; thruplayPct: number | null; completedPct: number | null; cpv: number | null; planCpv: number | null;
  };
}

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}
function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
}
const empty = (): PlatformActual => ({ spend: 0, impressions: 0, reach: 0, views: 0, thruplay: 0, completedViews: 0 });
const pct = (a: number, b: number): number | null => (b > 0 ? a / b : null);

async function fetchMeta(brand: BrandConfig, from: string, to: string, filter: string, usdIls: number): Promise<PlatformActual> {
  const a = empty();
  if (!brand.metaAccountId) return a;
  const acc = normId(brand.metaAccountId);
  const rows = await fetchWindsor({
    connector: "facebook",
    fields: ["account_id", "currency", "campaign", "spend", "impressions", "reach", "actions_video_view", "video_thruplay_watched_actions", "video_p100_watched_actions"],
    dateFrom: from, dateTo: to, accounts: [brand.metaAccountId],
    options: { attribution_window: "7d_click,1d_view" }, cacheSeconds: 120,
  }).catch(() => []);
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    if (filter && !String(r.campaign ?? "").toLowerCase().includes(filter)) continue;
    a.spend += toIls(num(r.spend), String(r.currency ?? brand.nativeCurrency).toUpperCase(), usdIls);
    a.impressions += num(r.impressions);
    a.reach += num(r.reach);
    a.views += num(r.actions_video_view);
    a.thruplay += sumAction(r.video_thruplay_watched_actions);
    a.completedViews += sumAction(r.video_p100_watched_actions);
  }
  return a;
}

async function fetchTikTok(brand: BrandConfig, from: string, to: string, filter: string, usdIls: number): Promise<PlatformActual> {
  const a = empty();
  if (!brand.tiktokAccountId) return a;
  const acc = normId(brand.tiktokAccountId);
  const rows = await fetchWindsor({
    connector: "tiktok",
    fields: ["account_id", "currency", "campaign_name", "spend", "impressions", "reach", "video_watched_2s", "video_watched_6s", "video_views_p100"],
    dateFrom: from, dateTo: to, accounts: [brand.tiktokAccountId], cacheSeconds: 120,
  }).catch(() => []);
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    if (filter && !String(r.campaign_name ?? "").toLowerCase().includes(filter)) continue;
    a.spend += toIls(num(r.spend), String(r.currency ?? brand.nativeCurrency).toUpperCase(), usdIls);
    a.impressions += num(r.impressions);
    a.reach += num(r.reach);
    a.views += num(r.video_watched_2s);
    a.thruplay += num(r.video_watched_6s);
    a.completedViews += num(r.video_views_p100);
  }
  return a;
}

async function fetchYouTube(brand: BrandConfig, from: string, to: string, filter: string, usdIls: number): Promise<PlatformActual> {
  const a = empty();
  if (!brand.googleAccountId) return a;
  const acc = normId(brand.googleAccountId);
  const rows = await fetchWindsor({
    connector: "google_ads",
    fields: ["account_id", "currency", "campaign", "spend", "impressions", "video_views", "video_quartile_p25_rate", "video_quartile_p100_rate"],
    dateFrom: from, dateTo: to, accounts: [brand.googleAccountId], cacheSeconds: 120,
  }).catch(() => []);
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    if (filter && !String(r.campaign ?? "").toLowerCase().includes(filter)) continue;
    const impr = num(r.impressions);
    a.spend += toIls(num(r.spend), String(r.currency ?? brand.nativeCurrency).toUpperCase(), usdIls);
    a.impressions += impr;
    // Google reports quartiles as rates (share of impressions), and video_views is often null on
    // YouTube video campaigns — derive counts from the rates.
    a.views += num(r.video_views) || impr * num(r.video_quartile_p25_rate);
    a.completedViews += impr * num(r.video_quartile_p100_rate);
  }
  return a;
}

export async function getPlatformPlanExecution(brand: BrandConfig): Promise<PlatformPlanExecution | null> {
  const plan = brand.platformPlan;
  if (!plan) return null;
  const filter = (brand.campaignFilter ?? "").toLowerCase();
  const t = today();
  const asOf = t < plan.flightEnd ? t : plan.flightEnd;
  const from = plan.flightStart;
  const usdIls = await fetchUsdIlsRate();

  // Fetch each platform present in the plan, once.
  const platforms = new Set(plan.lines.map((l) => l.platform));
  const [meta, tiktok, youtube] = await Promise.all([
    platforms.has("meta") ? fetchMeta(brand, from, asOf, filter, usdIls) : empty(),
    platforms.has("tiktok") ? fetchTikTok(brand, from, asOf, filter, usdIls) : empty(),
    platforms.has("youtube") ? fetchYouTube(brand, from, asOf, filter, usdIls) : empty(),
  ]);
  const actualsRaw: Record<string, PlatformActual> = { meta, tiktok, youtube };

  const lines: PlatformLineExecution[] = plan.lines.map((line) => {
    const a = actualsRaw[line.platform] ?? empty();
    return {
      line,
      actual: a,
      spendPct: pct(a.spend, line.budget),
      thruplayPct: pct(a.thruplay, line.thruplay),
      completedPct: pct(a.completedViews, line.completedViews),
      cpv: a.thruplay ? a.spend / a.thruplay : null,
      planCpv: line.thruplay ? line.budget / line.thruplay : null,
      cpCompleted: a.completedViews ? a.spend / a.completedViews : null,
      connected: a.spend > 0 || a.impressions > 0,
    };
  });

  const sum = (f: (l: PlatformLineExecution) => number) => lines.reduce((s, l) => s + f(l), 0);
  const budget = sum((l) => l.line.budget);
  const spend = sum((l) => l.actual.spend);
  const thruplayTarget = sum((l) => l.line.thruplay);
  const thruplay = sum((l) => l.actual.thruplay);
  const completedTarget = sum((l) => l.line.completedViews);
  const completedViews = sum((l) => l.actual.completedViews);

  return {
    flightStart: plan.flightStart,
    flightEnd: plan.flightEnd,
    asOf,
    elapsedDays: daysInclusive(plan.flightStart, asOf),
    totalDays: daysInclusive(plan.flightStart, plan.flightEnd),
    lines,
    totals: {
      budget, spend, thruplayTarget, thruplay, completedTarget, completedViews,
      spendPct: pct(spend, budget),
      thruplayPct: pct(thruplay, thruplayTarget),
      completedPct: pct(completedViews, completedTarget),
      cpv: thruplay ? spend / thruplay : null,
      planCpv: thruplayTarget ? budget / thruplayTarget : null,
    },
  };
}
