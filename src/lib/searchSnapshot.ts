// Google search snapshot (e.g. Colgate) — per account (Total, Optic White), campaigns grouped
// by competitive type parsed from the name (_CBF_CPT/LED/PTP/CPS_ → Compete/Lead/Participate/
// Compete Site). Shows Impressions, Impression Share, Clicks, CPC, CTR, Budget Spent (native
// currency, e.g. EUR).
//
// Impression Share drives a per-type KPI (Lead ≥70%, Compete ≥50%, Participate ≤50%). When a
// campaign misses its KPI, "lost impression share" is split into rank vs budget so the fix is
// obvious (rank → bids/quality/relevance; budget → raise budget). Google does NOT expose
// impression share at keyword/search-term level, so each campaign also carries a keyword and a
// search-term breakdown (impressions/clicks/cost/CTR/CPC) to show WHERE to act.

import { unstable_cache } from "next/cache";
import type { BrandConfig, GoogleSnapshotConfig } from "./brands";
import { fetchWindsor, num, type WindsorRow } from "./windsor";
import { gaql, googleAdsConfigured } from "./googleAds";
import { shiftDate } from "./dates";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const TOP_N = 15; // keywords / search terms shown per campaign

export type ColgateType = "compete" | "lead" | "participate" | "compete_site" | "other";
export const TYPE_ORDER: ColgateType[] = ["compete", "lead", "participate", "compete_site"];
export const TYPE_LABEL: Record<ColgateType, string> = {
  compete: "Compete",
  lead: "Lead",
  participate: "Participate",
  compete_site: "Compete Site",
  other: "Other",
};

// Impression-share KPI per type. min = want at least; max = want at most.
export interface Target { kind: "min" | "max"; value: number }
export const TYPE_TARGET: Record<ColgateType, Target | null> = {
  lead: { kind: "min", value: 0.7 },
  compete: { kind: "min", value: 0.5 },
  participate: { kind: "max", value: 0.5 },
  compete_site: null,
  other: null,
};
export function meetsTarget(is: number | null, t: Target | null): boolean | null {
  if (is === null || !t) return null;
  return t.kind === "min" ? is >= t.value : is <= t.value;
}

function classify(name: string): ColgateType {
  const m = String(name).match(/_CBF_(CPT|LED|PTP|CPS)_/i);
  const c = m?.[1]?.toUpperCase();
  return c === "CPT" ? "compete" : c === "LED" ? "lead" : c === "PTP" ? "participate" : c === "CPS" ? "compete_site" : "other";
}

export interface KwRow { text: string; matchType: string; impressions: number; clicks: number; cost: number; ctr: number | null; cpc: number | null }
export interface StRow { term: string; impressions: number; clicks: number; cost: number; ctr: number | null; cpc: number | null }

export interface CampaignDetail {
  name: string;
  type: ColgateType;
  impressions: number;
  clicks: number;
  cost: number;
  impShare: number | null;
  cpc: number | null;
  ctr: number | null;
  lostRank: number | null; // search_rank_lost_impression_share
  lostBudget: number | null; // search_budget_lost_impression_share
  target: Target | null;
  pass: boolean | null;
  keywords: KwRow[];
  searchTerms: StRow[];
}

export interface TypeRow {
  type: ColgateType;
  impressions: number;
  impShare: number | null;
  clicks: number;
  cost: number;
  cpc: number | null;
  ctr: number | null;
  absTopIS: number | null; // search_absolute_top_impression_share (Google Ads API only)
  lostRank: number | null;
  lostBudget: number | null;
  target: Target | null;
  pass: boolean | null;
}
export interface SnapSection {
  title: string;
  account: string;
  currency: string;
  rows: TypeRow[];
  totals: TypeRow;
  campaigns: CampaignDetail[];
  trend: SnapTrendPoint[]; // per-account impression-share trend (all campaigns blended)
  trendByType: { type: ColgateType; trend: SnapTrendPoint[] }[]; // trend per campaign type (Lead, …)
  competitors: CompetitorRow[]; // rival domains on the same search terms (auction insights)
}
// Per-day trend across all snapshot accounts: impression-weighted IS + impressions/clicks/spend.
export interface SnapTrendPoint { date: string; impShare: number | null; impressions: number; clicks: number; spend: number }
// A rival domain competing on the same search terms (Google auction insights). Windsor exposes the
// domain but not the per-competitor impression share, so we characterise them by: which of our
// campaign TYPES they hit (Lead/Compete/…), overlap breadth (# campaigns), days active in range,
// and whether they're NEW vs the previous period.
export interface CompetitorRow { domain: string; campaigns: number; days: number; types: ColgateType[]; isNew: boolean }
export interface SearchSnapshot { sections: SnapSection[]; trend: SnapTrendPoint[]; currency: string }

const cKey = (r: WindsorRow) => `${normId(r.account_id)}||${String(r.campaign ?? "")}`;

// Aggregate keyword rows for one campaign, top N by impressions.
function topKeywords(rows: WindsorRow[]): KwRow[] {
  const m = new Map<string, KwRow>();
  for (const r of rows) {
    const text = String(r.keyword_text ?? "").trim();
    if (!text) continue;
    const matchType = String(r.match_type ?? "").trim();
    const k = `${text}|${matchType}`;
    const e = m.get(k) ?? { text, matchType, impressions: 0, clicks: 0, cost: 0, ctr: null, cpc: null };
    e.impressions += num(r.impressions);
    e.clicks += num(r.clicks);
    e.cost += num(r.spend);
    m.set(k, e);
  }
  return [...m.values()]
    .map((e) => ({ ...e, cost: Math.round(e.cost * 100) / 100, ctr: e.impressions ? e.clicks / e.impressions : null, cpc: e.clicks ? e.cost / e.clicks : null }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, TOP_N);
}

function topSearchTerms(rows: WindsorRow[]): StRow[] {
  const m = new Map<string, StRow>();
  for (const r of rows) {
    const term = String(r.search_term ?? "").trim();
    if (!term) continue;
    const e = m.get(term) ?? { term, impressions: 0, clicks: 0, cost: 0, ctr: null, cpc: null };
    e.impressions += num(r.impressions);
    e.clicks += num(r.clicks);
    e.cost += num(r.spend);
    m.set(term, e);
  }
  return [...m.values()]
    .map((e) => ({ ...e, cost: Math.round(e.cost * 100) / 100, ctr: e.impressions ? e.clicks / e.impressions : null, cpc: e.clicks ? e.cost / e.clicks : null }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, TOP_N);
}

type Agg = { impr: number; clicks: number; cost: number; eligible: number; lostRankW: number; lostBudgetW: number; absTopW: number; absTopElig: number };
const emptyAgg = (): Agg => ({ impr: 0, clicks: 0, cost: 0, eligible: 0, lostRankW: 0, lostBudgetW: 0, absTopW: 0, absTopElig: 0 });

function rowFromAgg(type: ColgateType, e: Agg): TypeRow {
  const impShare = e.eligible ? e.impr / e.eligible : null;
  const target = TYPE_TARGET[type];
  return {
    type,
    impressions: Math.round(e.impr),
    impShare,
    clicks: Math.round(e.clicks),
    cost: Math.round(e.cost * 100) / 100,
    cpc: e.clicks ? e.cost / e.clicks : null,
    ctr: e.impr ? e.clicks / e.impr : null,
    absTopIS: e.absTopElig ? e.absTopW / e.absTopElig : null,
    lostRank: e.eligible ? e.lostRankW / e.eligible : null,
    lostBudget: e.eligible ? e.lostBudgetW / e.eligible : null,
    target,
    pass: meetsTarget(impShare, target),
  };
}

function buildSection(cfg: GoogleSnapshotConfig, campRows: WindsorRow[], kwRows: WindsorRow[], stRows: WindsorRow[]): SnapSection {
  const acc = normId(cfg.account);
  let currency = "EUR";

  // Index keyword / search-term rows by campaign for this account.
  const groupByCampaign = (rows: WindsorRow[]) => {
    const m = new Map<string, WindsorRow[]>();
    for (const r of rows) {
      if (normId(r.account_id) !== acc) continue;
      const k = cKey(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const kwByCampaign = groupByCampaign(kwRows);
  const stByCampaign = groupByCampaign(stRows);

  const campaigns: CampaignDetail[] = [];
  const byType = new Map<ColgateType, Agg>();

  for (const r of campRows) {
    if (normId(r.account_id) !== acc) continue;
    if (r.currency) currency = String(r.currency).toUpperCase();
    const name = String(r.campaign ?? "");
    const type = classify(name);
    const impr = num(r.impressions), clicks = num(r.clicks), cost = num(r.spend);
    const is = num(r.search_impression_share);
    const impShare = is > 0 ? is : null;
    const eligible = is > 0 ? impr / is : 0;
    const lostRank = r.search_rank_lost_impression_share == null ? null : num(r.search_rank_lost_impression_share);
    const lostBudget = r.search_budget_lost_impression_share == null ? null : num(r.search_budget_lost_impression_share);
    const absTop = r.search_absolute_top_impression_share == null ? null : num(r.search_absolute_top_impression_share);
    const target = TYPE_TARGET[type];

    const key = cKey(r);
    campaigns.push({
      name,
      type,
      impressions: Math.round(impr),
      clicks: Math.round(clicks),
      cost: Math.round(cost * 100) / 100,
      impShare,
      cpc: clicks ? cost / clicks : null,
      ctr: impr ? clicks / impr : null,
      lostRank,
      lostBudget,
      target,
      pass: meetsTarget(impShare, target),
      keywords: topKeywords(kwByCampaign.get(key) ?? []),
      searchTerms: topSearchTerms(stByCampaign.get(key) ?? []),
    });

    const e = byType.get(type) ?? emptyAgg();
    e.impr += impr;
    e.clicks += clicks;
    e.cost += cost;
    e.eligible += eligible;
    if (lostRank != null) e.lostRankW += lostRank * eligible;
    if (lostBudget != null) e.lostBudgetW += lostBudget * eligible;
    if (absTop != null) { e.absTopW += absTop * eligible; e.absTopElig += eligible; }
    byType.set(type, e);
  }

  const rows = TYPE_ORDER.map((t) => rowFromAgg(t, byType.get(t) ?? emptyAgg()));
  const totAgg = [...byType.values()].reduce((a, e) => ({
    impr: a.impr + e.impr, clicks: a.clicks + e.clicks, cost: a.cost + e.cost,
    eligible: a.eligible + e.eligible, lostRankW: a.lostRankW + e.lostRankW, lostBudgetW: a.lostBudgetW + e.lostBudgetW,
    absTopW: a.absTopW + e.absTopW, absTopElig: a.absTopElig + e.absTopElig,
  }), emptyAgg());
  const totals = rowFromAgg("other", totAgg);

  // Order campaigns by type (Compete, Lead, Participate, Compete Site), then impressions desc.
  const rank = (t: ColgateType) => { const i = TYPE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
  campaigns.sort((a, b) => rank(a.type) - rank(b.type) || b.impressions - a.impressions);

  return { title: cfg.title, account: cfg.account, currency, rows, totals, campaigns, trend: [], trendByType: [], competitors: [] };
}

// The Google Ads API section is 6 live queries — cache it (the client polls every 90s and the page
// re-renders on nav). Impression share doesn't move minute-to-minute, so ~3 min staleness is fine.
const buildSectionViaApi = unstable_cache(
  (cfg: GoogleSnapshotConfig, from: string, to: string, prevFrom: string, prevTo: string) => _buildSectionViaApi(cfg, from, to, prevFrom, prevTo),
  ["snapshot-api-section"],
  { revalidate: 180, tags: ["snapshot"] },
);

// Build a section directly from the Google Ads API (accurate first-party IS; competitor domains via
// the auction_insight_domain segment). Flattens GAQL rows into the same shape the Windsor builder
// consumes, so buildSection is reused for the type table + keyword/search-term analysis.
async function _buildSectionViaApi(cfg: GoogleSnapshotConfig, from: string, to: string, prevFrom: string, prevTo: string): Promise<SnapSection> {
  const cust = cfg.account;
  const dateBetween = (a: string, b: string) => `segments.date BETWEEN '${a}' AND '${b}'`;
  const [camp, kw, st, daily, auc, aucPrev] = await Promise.all([
    gaql(cust, `SELECT campaign.name, customer.currency_code, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.search_impression_share, metrics.search_absolute_top_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share FROM campaign WHERE ${dateBetween(from, to)} AND metrics.impressions > 0`).catch(() => []),
    gaql(cust, `SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE ${dateBetween(from, to)} AND metrics.impressions > 0`).catch(() => []),
    gaql(cust, `SELECT campaign.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros FROM search_term_view WHERE ${dateBetween(from, to)} AND metrics.impressions > 0`).catch(() => []),
    gaql(cust, `SELECT segments.date, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.search_impression_share FROM campaign WHERE ${dateBetween(from, to)} AND metrics.impressions > 0`).catch(() => []),
    gaql(cust, `SELECT campaign.name, segments.date, segments.auction_insight_domain FROM campaign WHERE ${dateBetween(from, to)}`).catch(() => []),
    gaql(cust, `SELECT segments.auction_insight_domain FROM campaign WHERE ${dateBetween(prevFrom, prevTo)}`).catch(() => []),
  ]);
  const g = (r: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), r);
  const cost = (r: unknown) => num(g(r, "metrics.costMicros") as never) / 1e6;
  const currency = String((g(camp[0], "customer.currencyCode") as string) ?? "EUR").toUpperCase();

  // Flatten to the Windsor row shape buildSection expects.
  const campRows = camp.map((r) => ({ account_id: cust, currency, campaign: g(r, "campaign.name"), impressions: num(g(r, "metrics.impressions") as never), clicks: num(g(r, "metrics.clicks") as never), spend: cost(r), search_impression_share: num(g(r, "metrics.searchImpressionShare") as never), search_absolute_top_impression_share: g(r, "metrics.searchAbsoluteTopImpressionShare") ?? null, search_rank_lost_impression_share: g(r, "metrics.searchRankLostImpressionShare") ?? null, search_budget_lost_impression_share: g(r, "metrics.searchBudgetLostImpressionShare") ?? null })) as unknown as WindsorRow[];
  const kwRows = kw.map((r) => ({ account_id: cust, campaign: g(r, "campaign.name"), keyword_text: g(r, "adGroupCriterion.keyword.text"), match_type: g(r, "adGroupCriterion.keyword.matchType"), impressions: num(g(r, "metrics.impressions") as never), clicks: num(g(r, "metrics.clicks") as never), spend: cost(r) })) as unknown as WindsorRow[];
  const stRows = st.map((r) => ({ account_id: cust, campaign: g(r, "campaign.name"), search_term: g(r, "searchTermView.searchTerm"), impressions: num(g(r, "metrics.impressions") as never), clicks: num(g(r, "metrics.clicks") as never), spend: cost(r) })) as unknown as WindsorRow[];
  const sec = buildSection(cfg, campRows, kwRows, stRows);

  // Impression-weighted IS trend (all + per type) from the daily rows.
  const trendOf = (typeFilter?: ColgateType): SnapTrendPoint[] => {
    const byDate = new Map<string, { impr: number; clicks: number; cost: number; el: number }>();
    for (const r of daily) {
      const camp = String(g(r, "campaign.name") ?? "");
      if (typeFilter && classify(camp) !== typeFilter) continue;
      const d = String(g(r, "segments.date") ?? "").slice(0, 10);
      if (!d) continue;
      const impr = num(g(r, "metrics.impressions") as never), is = num(g(r, "metrics.searchImpressionShare") as never);
      const e = byDate.get(d) ?? { impr: 0, clicks: 0, cost: 0, el: 0 };
      e.impr += impr; e.clicks += num(g(r, "metrics.clicks") as never); e.cost += cost(r); e.el += is > 0 ? impr / is : 0;
      byDate.set(d, e);
    }
    return [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, e]) => ({ date, impressions: Math.round(e.impr), clicks: Math.round(e.clicks), spend: Math.round(e.cost * 100) / 100, impShare: e.el ? e.impr / e.el : null }));
  };
  const typesPresent = TYPE_ORDER.filter((t) => sec.campaigns.some((cp) => cp.type === t));

  // Competitors (auction insights): domains only — the per-competitor metrics need a metric-access
  // grant, so we characterise by campaign types, days active, and new-vs-previous, like the Windsor path.
  const prevDomains = new Set(aucPrev.map((r) => String(g(r, "segments.auctionInsightDomain") ?? "").trim().toLowerCase()).filter(Boolean));
  const byDomain = new Map<string, { camps: Set<string>; dates: Set<string>; types: Set<ColgateType> }>();
  for (const r of auc) {
    const domain = String(g(r, "segments.auctionInsightDomain") ?? "").trim().toLowerCase();
    if (!domain) continue;
    const camp = String(g(r, "campaign.name") ?? "");
    const e = byDomain.get(domain) ?? { camps: new Set(), dates: new Set(), types: new Set() };
    e.camps.add(camp);
    const d = String(g(r, "segments.date") ?? "").slice(0, 10);
    if (d) e.dates.add(d);
    e.types.add(classify(camp));
    byDomain.set(domain, e);
  }
  const competitors: CompetitorRow[] = [...byDomain]
    .map(([domain, e]) => ({ domain, campaigns: e.camps.size, days: e.dates.size, types: [...e.types].filter((t) => t !== "other").sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)), isNew: !prevDomains.has(domain) }))
    .sort((a, b) => b.days - a.days || b.campaigns - a.campaigns || a.domain.localeCompare(b.domain))
    .slice(0, 50);

  return { ...sec, trend: trendOf(), trendByType: typesPresent.map((t) => ({ type: t, trend: trendOf(t) })), competitors };
}

export async function getSearchSnapshot(brand: BrandConfig, from: string, to: string): Promise<SearchSnapshot | null> {
  if (!brand.googleSnapshot?.length) return null;

  // Windsor ignores the accounts param, so one call each returns all accounts; we filter per-section
  // by account_id. Granularities: campaign (with impression-share), keyword, search-term, and a
  // per-day pull for the impression-share trend.
  const daysInclusive = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(prevTo, -(daysInclusive(from, to) - 1));

  // Sections flagged `api` (and only when the Google Ads API is configured) come straight from the
  // Google Ads API; the rest still come from Windsor. Skip the Windsor fetches entirely if no
  // section needs them.
  const apiOn = googleAdsConfigured();
  const needWindsor = brand.googleSnapshot.some((c) => !(c.api && apiOn));
  const [campRows, kwRows, stRows, dayRows, auctionRows, prevAuctionRows] = needWindsor
    ? await Promise.all([
        fetchWindsor({
          connector: "google_ads",
          fields: ["account_id", "currency", "campaign", "impressions", "clicks", "spend", "search_impression_share", "search_absolute_top_impression_share", "search_rank_lost_impression_share", "search_budget_lost_impression_share"],
          dateFrom: from, dateTo: to, cacheSeconds: 180,
        }).catch(() => [] as WindsorRow[]),
        fetchWindsor({
          connector: "google_ads",
          fields: ["account_id", "campaign", "keyword_text", "match_type", "impressions", "clicks", "spend"],
          dateFrom: from, dateTo: to, cacheSeconds: 180,
        }).catch(() => [] as WindsorRow[]),
        fetchWindsor({
          connector: "google_ads",
          fields: ["account_id", "campaign", "search_term", "impressions", "clicks", "spend"],
          dateFrom: from, dateTo: to, cacheSeconds: 180,
        }).catch(() => [] as WindsorRow[]),
        fetchWindsor({
          connector: "google_ads",
          fields: ["date", "account_id", "currency", "campaign", "impressions", "clicks", "spend", "search_impression_share"],
          dateFrom: from, dateTo: to, cacheSeconds: 180,
        }).catch(() => [] as WindsorRow[]),
        fetchWindsor({
          connector: "google_ads",
          fields: ["date", "account_id", "campaign", "auction_insight_domain"],
          dateFrom: from, dateTo: to, cacheSeconds: 180,
        }).catch(() => [] as WindsorRow[]),
        fetchWindsor({
          connector: "google_ads",
          fields: ["account_id", "auction_insight_domain"],
          dateFrom: prevFrom, dateTo: prevTo, cacheSeconds: 300,
        }).catch(() => [] as WindsorRow[]),
      ])
    : ([[], [], [], [], [], []] as WindsorRow[][]);

  // Client-level trend uses the Windsor (non-api) accounts. Native currency (EUR).
  const accSet = new Set(brand.googleSnapshot.filter((c) => !(c.api && apiOn)).map((g) => normId(g.account)));
  let currency = "EUR";
  for (const r of dayRows) {
    if (accSet.has(normId(r.account_id)) && r.currency) { currency = String(r.currency).toUpperCase(); break; }
  }
  // Impression-weighted IS trend for a set of accounts, optionally filtered to one campaign type.
  // Filtering by type isolates e.g. the Lead (LED) campaign so it isn't diluted by the account blend.
  const buildTrend = (accs: Set<string>, typeFilter?: ColgateType): SnapTrendPoint[] => {
    const byDate = new Map<string, { impr: number; clicks: number; cost: number; eligible: number }>();
    for (const r of dayRows) {
      if (!accs.has(normId(r.account_id))) continue;
      if (typeFilter && classify(String(r.campaign ?? "")) !== typeFilter) continue;
      const d = String(r.date ?? "").slice(0, 10);
      if (!d) continue;
      const impr = num(r.impressions), is = num(r.search_impression_share);
      const e = byDate.get(d) ?? { impr: 0, clicks: 0, cost: 0, eligible: 0 };
      e.impr += impr;
      e.clicks += num(r.clicks);
      e.cost += num(r.spend);
      e.eligible += is > 0 ? impr / is : 0;
      byDate.set(d, e);
    }
    return [...byDate]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, e]) => ({ date, impressions: Math.round(e.impr), clicks: Math.round(e.clicks), spend: Math.round(e.cost * 100) / 100, impShare: e.eligible ? e.impr / e.eligible : null }));
  };

  // Competitors (auction insights): rival domains on the same terms, per account. Windsor returns
  // the domain but not per-competitor IS, so we characterise each by the campaign types they hit,
  // overlap breadth, days active, and whether they're new vs the previous period.
  const prevByAcc = new Map<string, Set<string>>();
  for (const r of prevAuctionRows) {
    const acc = normId(r.account_id);
    const domain = String(r.auction_insight_domain ?? "").trim().toLowerCase();
    if (!domain) continue;
    (prevByAcc.get(acc) ?? prevByAcc.set(acc, new Set()).get(acc)!).add(domain);
  }
  const buildCompetitors = (acc: string): CompetitorRow[] => {
    const byDomain = new Map<string, { camps: Set<string>; dates: Set<string>; types: Set<ColgateType> }>();
    for (const r of auctionRows) {
      if (normId(r.account_id) !== acc) continue;
      const domain = String(r.auction_insight_domain ?? "").trim().toLowerCase();
      if (!domain) continue;
      const camp = String(r.campaign ?? "");
      const e = byDomain.get(domain) ?? { camps: new Set(), dates: new Set(), types: new Set() };
      e.camps.add(camp);
      const d = String(r.date ?? "").slice(0, 10);
      if (d) e.dates.add(d);
      e.types.add(classify(camp));
      byDomain.set(domain, e);
    }
    const prev = prevByAcc.get(acc) ?? new Set<string>();
    return [...byDomain]
      .map(([domain, e]) => ({
        domain,
        campaigns: e.camps.size,
        days: e.dates.size,
        types: [...e.types].filter((t) => t !== "other").sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)),
        isNew: !prev.has(domain),
      }))
      .sort((a, b) => b.days - a.days || b.campaigns - a.campaigns || a.domain.localeCompare(b.domain))
      .slice(0, 50);
  };

  const sections = await Promise.all(
    brand.googleSnapshot.map(async (c) => {
      if (c.api && apiOn) return buildSectionViaApi(c, from, to, prevFrom, prevTo);
      const sec = buildSection(c, campRows, kwRows, stRows);
      const acc1 = new Set([normId(c.account)]);
      const typesPresent = TYPE_ORDER.filter((t) => sec.campaigns.some((cp) => cp.type === t));
      return {
        ...sec,
        trend: buildTrend(acc1),
        trendByType: typesPresent.map((t) => ({ type: t, trend: buildTrend(acc1, t) })),
        competitors: buildCompetitors(normId(c.account)),
      };
    }),
  );
  return { sections, trend: buildTrend(accSet), currency };
}
