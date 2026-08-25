// Per-platform plan-vs-execution for automotive awareness brands (Chery, Xpeng). Each plan line is
// one platform's flight commitment; we pull live Windsor actuals AT AD LEVEL (ONLY campaigns whose
// name contains the brand's campaignFilter — e.g. "leaders"), convert USD→ILS, and compare planned
// vs actual spend / 15s-views (thruplay) / 100%-views. Ad rows are also attributed to a creator and
// grouped by content for the per-influencer / per-content breakdowns (like the media plan).

import type { BrandConfig, PlatformPlanLine, CreatorConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { fetchUsdIlsRate, toIls } from "./fx";
import { today } from "./dates";

export interface PlatformActual {
  spend: number; impressions: number; reach: number; views: number; thruplay: number; completedViews: number;
}
export interface PlatformLineExecution {
  line: PlatformPlanLine;
  actual: PlatformActual;
  spendPct: number | null; thruplayPct: number | null; completedPct: number | null;
  cpv: number | null; planCpv: number | null; cpCompleted: number | null; connected: boolean;
}
export interface CreatorRow {
  id: string; name: string; spend: number; thruplay: number; completedViews: number; views: number; cpv: number | null;
}
export interface ContentRow {
  content: string; creatorName: string; platforms: string; spend: number; thruplay: number; completedViews: number; cpv: number | null;
}
export interface LeadRow {
  platform: string; title: string;
  leads: number; // total conversions across all leaders campaigns (leadgen + bonus)
  leadgenLeads: number; // from dedicated leadgen campaigns only
  leadgenSpend: number; // spend of dedicated leadgen campaigns only
  cpl: number | null; // leadgenSpend ÷ leadgenLeads — dedicated lead cost only (bonus excluded)
}
export interface PlatformPlanExecution {
  flightStart: string; flightEnd: string; asOf: string; elapsedDays: number; totalDays: number;
  lines: PlatformLineExecution[];
  creators: CreatorRow[];
  contents: ContentRow[];
  leads: LeadRow[]; // leadgen campaigns (separate objective, kept out of the views metrics)
  totals: {
    budget: number; spend: number; thruplayTarget: number; thruplay: number; completedTarget: number; completedViews: number;
    spendPct: number | null; thruplayPct: number | null; completedPct: number | null; cpv: number | null; planCpv: number | null;
  };
}

type Platform = "meta" | "tiktok" | "youtube";
interface AdActual { platform: Platform; creatorId: string; creatorName: string; content: string; spend: number; impressions: number; views: number; thruplay: number; completedViews: number; isLead: boolean; leads: number; }
// Lead-gen campaigns have a different objective than the views plan; detect by name ("leadgen").
// Note "leaders" also contains "lead" — match the full "leadgen" token so the filter isn't tripped.
const isLeadgen = (name: string) => /leadgen/i.test(name);

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

function classifyCreator(creators: CreatorConfig[] | undefined, ...parts: unknown[]): { id: string; name: string } {
  const hay = parts.map((p) => String(p ?? "")).join(" ").toLowerCase();
  for (const c of creators ?? []) if (c.match.some((m) => hay.includes(m.toLowerCase()))) return { id: c.id, name: c.name };
  return { id: "other", name: "כללי / אחר" };
}
// Collapse near-duplicate content names (timestamps, file extensions, hash suffixes, script noise).
function normContent(s: string): string {
  return s.toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}:\d{2}/g, "")
    .replace(/\.(mov|mp4|mkv|jpg|jpeg|png)\b.*$/g, "")
    .replace(/_[a-z0-9]{7,}\b/gi, "")
    .replace(/[_\-]+/g, " ")
    .replace(/["'`]/g, "")
    .trim();
}
const cleanContent = (s: string) => normContent(s) || "(ללא שם)";

async function fetchMeta(brand: BrandConfig, from: string, to: string, filter: string, usdIls: number): Promise<AdActual[]> {
  if (!brand.metaAccountId) return [];
  const acc = normId(brand.metaAccountId);
  const rows = await fetchWindsor({
    connector: "facebook",
    fields: ["account_id", "currency", "campaign", "adset_name", "ad_name", "spend", "impressions", "reach", "actions_video_view", "video_thruplay_watched_actions", "video_p100_watched_actions", "actions_lead"],
    dateFrom: from, dateTo: to, accounts: [brand.metaAccountId], options: { attribution_window: "7d_click,1d_view" }, cacheSeconds: 1800,
  }).catch(() => []);
  const out: AdActual[] = [];
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const campaign = String(r.campaign ?? "");
    if (filter && !campaign.toLowerCase().includes(filter)) continue;
    const cr = classifyCreator(brand.creators, r.campaign, r.adset_name, r.ad_name);
    const lead = isLeadgen(campaign);
    out.push({
      platform: "meta", creatorId: cr.id, creatorName: cr.name, content: cleanContent(String(r.ad_name ?? "")),
      spend: toIls(num(r.spend), String(r.currency ?? brand.nativeCurrency).toUpperCase(), usdIls),
      impressions: num(r.impressions), views: num(r.actions_video_view),
      thruplay: sumAction(r.video_thruplay_watched_actions), completedViews: sumAction(r.video_p100_watched_actions),
      // Count leads on EVERY leaders campaign (views campaigns also drive lead-form / conversions),
      // not only dedicated leadgen ones. isLead only controls the views-metric exclusion below.
      isLead: lead, leads: sumAction(r.actions_lead),
    });
  }
  return out;
}

async function fetchTikTok(brand: BrandConfig, from: string, to: string, filter: string, usdIls: number): Promise<AdActual[]> {
  if (!brand.tiktokAccountId) return [];
  const acc = normId(brand.tiktokAccountId);
  const rows = await fetchWindsor({
    connector: "tiktok",
    fields: ["account_id", "currency", "campaign_name", "adgroup_name", "ad_name", "spend", "impressions", "reach", "video_watched_2s", "video_watched_6s", "video_views_p100", "leads", "conversions"],
    dateFrom: from, dateTo: to, accounts: [brand.tiktokAccountId], cacheSeconds: 1800,
  }).catch(() => []);
  const out: AdActual[] = [];
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const campaign = String(r.campaign_name ?? "");
    if (filter && !campaign.toLowerCase().includes(filter)) continue;
    const cr = classifyCreator(brand.creators, r.campaign_name, r.adgroup_name, r.ad_name);
    const lead = isLeadgen(campaign);
    out.push({
      platform: "tiktok", creatorId: cr.id, creatorName: cr.name, content: cleanContent(String(r.ad_name ?? "")),
      spend: toIls(num(r.spend), String(r.currency ?? brand.nativeCurrency).toUpperCase(), usdIls),
      impressions: num(r.impressions), views: num(r.video_watched_2s),
      thruplay: num(r.video_watched_6s), completedViews: num(r.video_views_p100),
      isLead: lead, leads: num(r.leads) || num(r.conversions),
    });
  }
  return out;
}

async function fetchYouTube(brand: BrandConfig, from: string, to: string, filter: string, usdIls: number): Promise<AdActual[]> {
  if (!brand.googleAccountId) return [];
  const acc = normId(brand.googleAccountId);
  const rows = await fetchWindsor({
    connector: "google_ads",
    fields: ["account_id", "currency", "campaign", "ad_name", "spend", "impressions", "video_quartile_p75_rate", "video_quartile_p100_rate", "conversions"],
    dateFrom: from, dateTo: to, accounts: [brand.googleAccountId], cacheSeconds: 1800,
  }).catch(() => []);
  const out: AdActual[] = [];
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const campaign = String(r.campaign ?? "");
    if (filter && !campaign.toLowerCase().includes(filter)) continue;
    const impr = num(r.impressions);
    const cr = classifyCreator(brand.creators, r.campaign, r.ad_name);
    const lead = isLeadgen(campaign);
    // Windsor's Google Ads connector has no TrueView "video_views" metric — only quartile rates.
    // 75%-watched (impressions × p75) is the closest match to Google's TrueView view count; use it
    // as the YouTube "view" for the count + CPV, and p100 for the 100% (full) view.
    out.push({
      platform: "youtube", creatorId: cr.id, creatorName: cr.name, content: cleanContent(String(r.ad_name ?? r.campaign ?? "")),
      spend: toIls(num(r.spend), String(r.currency ?? brand.nativeCurrency).toUpperCase(), usdIls),
      impressions: impr, views: impr * num(r.video_quartile_p75_rate),
      thruplay: impr * num(r.video_quartile_p75_rate), completedViews: impr * num(r.video_quartile_p100_rate),
      isLead: lead, leads: num(r.conversions),
    });
  }
  return out;
}

export async function getPlatformPlanExecution(brand: BrandConfig): Promise<PlatformPlanExecution | null> {
  const plan = brand.platformPlan;
  if (!plan) return null;
  const filter = (brand.campaignFilter ?? "").toLowerCase();
  const t = today();
  const asOf = t < plan.flightEnd ? t : plan.flightEnd;
  const from = plan.flightStart;
  const usdIls = await fetchUsdIlsRate();

  const platforms = new Set(plan.lines.map((l) => l.platform));
  const [metaAds, tiktokAds, ytAds] = await Promise.all([
    platforms.has("meta") ? fetchMeta(brand, from, asOf, filter, usdIls) : Promise.resolve([]),
    platforms.has("tiktok") ? fetchTikTok(brand, from, asOf, filter, usdIls) : Promise.resolve([]),
    platforms.has("youtube") ? fetchYouTube(brand, from, asOf, filter, usdIls) : Promise.resolve([]),
  ]);
  const allAds = [...metaAds, ...tiktokAds, ...ytAds];
  // The media plan is a VIEWS plan — leadgen campaigns (different objective) are kept out of the
  // views metrics so CPV / attainment aren't distorted. Leads/conversions, however, are counted from
  // EVERY leaders campaign (awareness campaigns also produce conversions).
  const ads = allAds.filter((a) => !a.isLead);

  // Per-platform totals (views only).
  const byPlatform: Record<Platform, PlatformActual> = { meta: empty(), tiktok: empty(), youtube: empty() };
  for (const a of ads) {
    const p = byPlatform[a.platform];
    p.spend += a.spend; p.impressions += a.impressions; p.views += a.views; p.thruplay += a.thruplay; p.completedViews += a.completedViews;
  }

  // Leads / conversions summary (per platform). Total conversions come from ALL leaders campaigns,
  // but CPL is charged ONLY to dedicated leadgen campaigns — conversions that arrive from views
  // campaigns are a bonus and must not inflate the cost per lead.
  const platLabelAll: Record<string, string> = { meta: "Meta", tiktok: "TikTok", youtube: "YouTube" };
  const leadMap = new Map<string, { leads: number; leadgenLeads: number; leadgenSpend: number }>();
  for (const a of allAds) {
    const e = leadMap.get(a.platform) ?? { leads: 0, leadgenLeads: 0, leadgenSpend: 0 };
    e.leads += a.leads;
    if (a.isLead) { e.leadgenLeads += a.leads; e.leadgenSpend += a.spend; }
    leadMap.set(a.platform, e);
  }
  const leads: LeadRow[] = [...leadMap]
    .filter(([, e]) => e.leads > 0)
    .map(([platform, e]) => ({ platform, title: platLabelAll[platform] ?? platform, leads: e.leads, leadgenLeads: e.leadgenLeads, leadgenSpend: e.leadgenSpend, cpl: e.leadgenLeads ? e.leadgenSpend / e.leadgenLeads : null }))
    .sort((a, b) => b.leads - a.leads);

  const lines: PlatformLineExecution[] = plan.lines.map((line) => {
    const a = byPlatform[line.platform] ?? empty();
    return {
      line, actual: a,
      spendPct: pct(a.spend, line.budget), thruplayPct: pct(a.thruplay, line.thruplay), completedPct: pct(a.completedViews, line.completedViews),
      cpv: a.thruplay ? a.spend / a.thruplay : null,
      planCpv: line.thruplay ? line.budget / line.thruplay : null,
      cpCompleted: a.completedViews ? a.spend / a.completedViews : null,
      connected: a.spend > 0 || a.impressions > 0,
    };
  });

  // Per-creator breakdown.
  const crMap = new Map<string, CreatorRow>();
  for (const a of ads) {
    const c = crMap.get(a.creatorId) ?? { id: a.creatorId, name: a.creatorName, spend: 0, thruplay: 0, completedViews: 0, views: 0, cpv: null };
    c.spend += a.spend; c.thruplay += a.thruplay; c.completedViews += a.completedViews; c.views += a.views;
    crMap.set(a.creatorId, c);
  }
  const creators = [...crMap.values()].map((c) => ({ ...c, cpv: c.thruplay ? c.spend / c.thruplay : null })).sort((a, b) => b.spend - a.spend);

  // Per-content breakdown (merged across platforms; creator kept for context).
  const coMap = new Map<string, ContentRow & { plats: Set<string> }>();
  for (const a of ads) {
    const key = a.creatorId + "|" + a.content;
    const e = coMap.get(key) ?? { content: a.content, creatorName: a.creatorName, platforms: "", spend: 0, thruplay: 0, completedViews: 0, cpv: null, plats: new Set<string>() };
    e.spend += a.spend; e.thruplay += a.thruplay; e.completedViews += a.completedViews; e.plats.add(a.platform);
    coMap.set(key, e);
  }
  const platLabel: Record<string, string> = { meta: "Meta", tiktok: "TikTok", youtube: "YouTube" };
  const contents = [...coMap.values()]
    .map((e) => ({ content: e.content, creatorName: e.creatorName, platforms: [...e.plats].map((p) => platLabel[p] ?? p).join(" · "), spend: e.spend, thruplay: e.thruplay, completedViews: e.completedViews, cpv: e.thruplay ? e.spend / e.thruplay : null }))
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  // Totals are straight sums of EVERY platform (YouTube included), so the total row equals the sum of
  // the rows above it. % attainment = total actual ÷ total target; YouTube carries actuals but a 0
  // target, so it adds to delivery without adding to the target (bonus delivery over the plan).
  const sum = (f: (l: PlatformLineExecution) => number) => lines.reduce((s, l) => s + f(l), 0);
  const budget = sum((l) => l.line.budget), spend = sum((l) => l.actual.spend);
  const thruplayTarget = sum((l) => l.line.thruplay);
  const completedTarget = sum((l) => l.line.completedViews);
  const thruplay = sum((l) => l.actual.thruplay);
  const completedViews = sum((l) => l.actual.completedViews);

  return {
    flightStart: plan.flightStart, flightEnd: plan.flightEnd, asOf,
    elapsedDays: daysInclusive(plan.flightStart, asOf), totalDays: daysInclusive(plan.flightStart, plan.flightEnd),
    lines, creators, contents, leads,
    totals: {
      budget, spend, thruplayTarget, thruplay, completedTarget, completedViews,
      spendPct: pct(spend, budget), thruplayPct: pct(thruplay, thruplayTarget), completedPct: pct(completedViews, completedTarget),
      cpv: thruplay ? spend / thruplay : null, planCpv: thruplayTarget ? budget / thruplayTarget : null,
    },
  };
}
