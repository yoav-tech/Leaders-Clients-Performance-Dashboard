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

import type { BrandConfig, GoogleSnapshotConfig } from "./brands";
import { fetchWindsor, num, type WindsorRow } from "./windsor";

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
}
export interface SearchSnapshot { sections: SnapSection[] }

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

type Agg = { impr: number; clicks: number; cost: number; eligible: number; lostRankW: number; lostBudgetW: number };
const emptyAgg = (): Agg => ({ impr: 0, clicks: 0, cost: 0, eligible: 0, lostRankW: 0, lostBudgetW: 0 });

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
    byType.set(type, e);
  }

  const rows = TYPE_ORDER.map((t) => rowFromAgg(t, byType.get(t) ?? emptyAgg()));
  const totAgg = [...byType.values()].reduce((a, e) => ({
    impr: a.impr + e.impr, clicks: a.clicks + e.clicks, cost: a.cost + e.cost,
    eligible: a.eligible + e.eligible, lostRankW: a.lostRankW + e.lostRankW, lostBudgetW: a.lostBudgetW + e.lostBudgetW,
  }), emptyAgg());
  const totals = rowFromAgg("other", totAgg);

  // Order campaigns by type (Compete, Lead, Participate, Compete Site), then impressions desc.
  const rank = (t: ColgateType) => { const i = TYPE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
  campaigns.sort((a, b) => rank(a.type) - rank(b.type) || b.impressions - a.impressions);

  return { title: cfg.title, account: cfg.account, currency, rows, totals, campaigns };
}

export async function getSearchSnapshot(brand: BrandConfig, from: string, to: string): Promise<SearchSnapshot | null> {
  if (!brand.googleSnapshot?.length) return null;

  // Windsor ignores the accounts param, so one call each returns all accounts; we filter per-section
  // by account_id. Three granularities: campaign (with impression-share), keyword, search-term.
  const [campRows, kwRows, stRows] = await Promise.all([
    fetchWindsor({
      connector: "google_ads",
      fields: ["account_id", "currency", "campaign", "impressions", "clicks", "spend", "search_impression_share", "search_rank_lost_impression_share", "search_budget_lost_impression_share"],
      dateFrom: from, dateTo: to, cacheSeconds: 60,
    }).catch(() => [] as WindsorRow[]),
    fetchWindsor({
      connector: "google_ads",
      fields: ["account_id", "campaign", "keyword_text", "match_type", "impressions", "clicks", "spend"],
      dateFrom: from, dateTo: to, cacheSeconds: 60,
    }).catch(() => [] as WindsorRow[]),
    fetchWindsor({
      connector: "google_ads",
      fields: ["account_id", "campaign", "search_term", "impressions", "clicks", "spend"],
      dateFrom: from, dateTo: to, cacheSeconds: 60,
    }).catch(() => [] as WindsorRow[]),
  ]);

  const sections = brand.googleSnapshot.map((c) => buildSection(c, campRows, kwRows, stRows));
  return { sections };
}
