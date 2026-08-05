// Google search snapshot (e.g. Colgate) — per account (Total, Optic White), campaigns grouped
// by competitive type parsed from the name (_CBF_CPT/LED/PTP/CPS_ → Compete/Lead/Participate/
// Compete Site). Shows Impressions, Impression Share, Clicks, CPC, CTR, Budget Spent (native
// currency, e.g. EUR). Impression Share is aggregated via eligible impressions.

import type { BrandConfig, GoogleSnapshotConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();

export type ColgateType = "compete" | "lead" | "participate" | "compete_site" | "other";
export const TYPE_ORDER: ColgateType[] = ["compete", "lead", "participate", "compete_site"];
export const TYPE_LABEL: Record<ColgateType, string> = {
  compete: "Compete",
  lead: "Lead",
  participate: "Participate",
  compete_site: "Compete Site",
  other: "Other",
};

function classify(name: string): ColgateType {
  const m = String(name).match(/_CBF_(CPT|LED|PTP|CPS)_/i);
  const c = m?.[1]?.toUpperCase();
  return c === "CPT" ? "compete" : c === "LED" ? "lead" : c === "PTP" ? "participate" : c === "CPS" ? "compete_site" : "other";
}

export interface TypeRow {
  type: ColgateType;
  impressions: number;
  impShare: number | null; // 0..1
  clicks: number;
  cost: number;
  cpc: number | null;
  ctr: number | null;
}
export interface SnapSection {
  title: string;
  account: string;
  currency: string;
  rows: TypeRow[];
  totals: TypeRow;
}
export interface SearchSnapshot {
  sections: SnapSection[];
}

type Agg = { impr: number; clicks: number; cost: number; eligible: number };

async function fetchSection(cfg: GoogleSnapshotConfig, from: string, to: string): Promise<SnapSection> {
  const acc = normId(cfg.account);
  let currency = "EUR";
  const rows = await fetchWindsor({
    connector: "google_ads",
    fields: ["account_id", "currency", "campaign", "impressions", "clicks", "spend", "search_impression_share"],
    dateFrom: from,
    dateTo: to,
    accounts: [cfg.account],
    cacheSeconds: 60,
  }).catch(() => []);

  const byType = new Map<ColgateType, Agg>();
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    if (r.currency) currency = String(r.currency).toUpperCase();
    const type = classify(String(r.campaign ?? ""));
    const impr = num(r.impressions), clicks = num(r.clicks), cost = num(r.spend), is = num(r.search_impression_share);
    const e = byType.get(type) ?? { impr: 0, clicks: 0, cost: 0, eligible: 0 };
    e.impr += impr;
    e.clicks += clicks;
    e.cost += cost;
    e.eligible += is > 0 ? impr / is : 0; // eligible impressions, for correct IS aggregation
    byType.set(type, e);
  }

  const mk = (type: ColgateType, e: Agg): TypeRow => ({
    type,
    impressions: Math.round(e.impr),
    impShare: e.eligible ? e.impr / e.eligible : null,
    clicks: Math.round(e.clicks),
    cost: Math.round(e.cost * 100) / 100,
    cpc: e.clicks ? e.cost / e.clicks : null,
    ctr: e.impr ? e.clicks / e.impr : null,
  });

  const rowsOut = TYPE_ORDER.map((t) => mk(t, byType.get(t) ?? { impr: 0, clicks: 0, cost: 0, eligible: 0 }));
  const tot = [...byType.values()].reduce((a, e) => ({ impr: a.impr + e.impr, clicks: a.clicks + e.clicks, cost: a.cost + e.cost, eligible: a.eligible + e.eligible }), { impr: 0, clicks: 0, cost: 0, eligible: 0 });
  return { title: cfg.title, account: cfg.account, currency, rows: rowsOut, totals: mk("other", tot) };
}

export async function getSearchSnapshot(brand: BrandConfig, from: string, to: string): Promise<SearchSnapshot | null> {
  if (!brand.googleSnapshot?.length) return null;
  const sections = await Promise.all(brand.googleSnapshot.map((c) => fetchSection(c, from, to)));
  return { sections };
}
