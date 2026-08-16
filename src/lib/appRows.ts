// Pure helpers for the app/leads report (Haat) — no server imports, so both the data layer
// (appReport.ts) and the client table (AppLevelTable) can share them.
//
// Every Haat campaign is named  "LDRS || <CITY> || <goal>"  (e.g. "LDRS || חיפה || app instals"
// or "LDRS || חיפה || registration"), so the city is always the second "||"-separated segment.

import { AD_LEVELS, type AdLevel } from "./adLevel";

export type CampType = "reach" | "install" | "registration" | "leads" | "other";

export function classifyType(name: string): CampType {
  const n = name.toLowerCase();
  if (/reach/.test(n)) return "reach";
  if (/install|instal/.test(n)) return "install";
  if (/registration|\breg\b/.test(n)) return "registration";
  if (/lead/.test(n)) return "leads";
  return "other";
}

// City = the segment between "LDRS ||" and the next "||". Null when the name isn't in that shape.
export function parseCity(name: string): string | null {
  const parts = name.split("||").map((s) => s.trim());
  if (parts.length >= 2 && /^ldrs$/i.test(parts[0]) && parts[1]) return parts[1];
  return null;
}

// One Meta ad-level row (finest grain) tagged with its campaign's type + city.
export interface AppRow {
  campaign: string;
  adgroup: string; // adset_name
  ad: string; // ad_name
  type: CampType;
  city: string | null;
  spend: number; // ILS
  impressions: number;
  clicks: number;
  reach: number;
  installs: number;
  registrations: number;
  purchases: number;
  leads: number;
}

// An aggregated table row at the chosen level (same shape the tables render).
export interface AggRow {
  name: string;
  type: CampType;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  installs: number;
  registrations: number;
  purchases: number;
  leads: number;
  ctr: number | null;
  cpc: number | null;
  cpi: number | null;
  cpReg: number | null;
  cpPurch: number | null;
  cpLead: number | null;
  cpm: number | null;
}

const keyFor = (r: AppRow, level: AdLevel) => (level === "ad" ? r.ad : level === "adgroup" ? r.adgroup : r.campaign);

// Group ad-level rows to campaign / ad-group / ad and derive the rate columns. Matches Windsor's
// own group-by behaviour (by the single level field), so an ad-group name shared across campaigns
// is merged — consistent with the ecommerce explorer.
export function aggregateRows(rows: AppRow[], level: AdLevel): AggRow[] {
  type Sum = { type: CampType; spend: number; impressions: number; clicks: number; reach: number; installs: number; registrations: number; purchases: number; leads: number };
  const m = new Map<string, Sum>();
  for (const r of rows) {
    const k = keyFor(r, level) || "—";
    const e = m.get(k) ?? { type: r.type, spend: 0, impressions: 0, clicks: 0, reach: 0, installs: 0, registrations: 0, purchases: 0, leads: 0 };
    e.spend += r.spend; e.impressions += r.impressions; e.clicks += r.clicks; e.reach += r.reach;
    e.installs += r.installs; e.registrations += r.registrations; e.purchases += r.purchases; e.leads += r.leads;
    m.set(k, e);
  }
  return [...m].map(([name, t]) => ({
    name,
    type: t.type,
    spend: Math.round(t.spend),
    impressions: Math.round(t.impressions),
    clicks: Math.round(t.clicks),
    reach: Math.round(t.reach),
    installs: Math.round(t.installs),
    registrations: Math.round(t.registrations),
    purchases: Math.round(t.purchases),
    leads: Math.round(t.leads),
    ctr: t.impressions ? t.clicks / t.impressions : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cpi: t.installs ? t.spend / t.installs : null,
    cpReg: t.registrations ? t.spend / t.registrations : null,
    cpPurch: t.purchases ? t.spend / t.purchases : null,
    cpLead: t.leads ? t.spend / t.leads : null,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
  }));
}

// Distinct cities present in a row set (for the filter dropdown), Hebrew-collated.
export function citiesOf(rows: AppRow[]): string[] {
  return [...new Set(rows.map((r) => r.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "he"));
}

export { AD_LEVELS, type AdLevel };
