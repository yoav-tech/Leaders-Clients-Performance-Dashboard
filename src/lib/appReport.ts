// Multi-section app/leads report (e.g. Haat: Delivery app + HR recruitment). Each section is a
// Meta account; we pull ONLY campaigns starting with "LDRS", classify each by type
// (reach / install / registration / leads) from its name, and aggregate totals, per-type
// groups, a projection to end-of-month, and a daily trend.

import type { BrandConfig, AppSectionConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { monthProgress, shiftDate, today } from "./dates";

const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);
const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const F = {
  install: "actions_mobile_app_install",
  reg: "actions_complete_registration",
  purch: "actions_omni_purchase",
  lead: "actions_lead",
};

export type CampType = "reach" | "install" | "registration" | "leads" | "other";
export function classifyType(name: string): CampType {
  const n = name.toLowerCase();
  if (/reach/.test(n)) return "reach";
  if (/install/.test(n)) return "install";
  if (/registration|\breg\b/.test(n)) return "registration";
  if (/lead/.test(n)) return "leads";
  return "other";
}

export interface AppCampaign {
  name: string;
  type: CampType;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number | null;
  cpc: number | null;
  installs: number;
  registrations: number;
  purchases: number;
  leads: number;
  cpi: number | null;
  cpReg: number | null;
  cpPurch: number | null;
  cpLead: number | null;
  cpm: number | null;
}
export interface Totals {
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
}
export interface AppSection {
  key: string;
  title: string;
  kind: "app" | "leads";
  budget: number; // monthly (0 = no pacing)
  totals: Totals;
  campaigns: AppCampaign[];
  trend: { date: string; spend: number; conversions: number }[];
  pacing: { monthSpend: number; elapsed: number; daysInMonth: number; projectedSpend: number; projectedConversions: number } | null;
}
export interface AppReport {
  sections: AppSection[];
}

function derive(t: {
  spend: number; impressions: number; clicks: number; reach: number;
  installs: number; registrations: number; purchases: number; leads: number;
}): Totals {
  return {
    ...t,
    ctr: t.impressions ? t.clicks / t.impressions : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cpi: t.installs ? t.spend / t.installs : null,
    cpReg: t.registrations ? t.spend / t.registrations : null,
    cpPurch: t.purchases ? t.spend / t.purchases : null,
    cpLead: t.leads ? t.spend / t.leads : null,
  };
}

async function fetchSection(cfg: AppSectionConfig, brand: BrandConfig, from: string, to: string): Promise<AppSection> {
  const account = cfg.account;
  const acc = normId(account);
  let cur = brand.nativeCurrency as string;
  const zero = () => ({ spend: 0, impressions: 0, clicks: 0, reach: 0, installs: 0, registrations: 0, purchases: 0, leads: 0 });
  const campMap = new Map<string, ReturnType<typeof zero>>();

  const rows = await fetchWindsor({
    connector: "facebook",
    fields: ["account_id", "currency", "campaign", "spend", "impressions", "clicks", "reach", F.install, F.reg, F.purch, F.lead],
    dateFrom: from,
    dateTo: to,
    accounts: [account],
    options: { attribution_window: "7d_click,1d_view" },
    cacheSeconds: 60,
  }).catch(() => []);

  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const name = String(r.campaign ?? "");
    if (!name.startsWith("LDRS")) continue; // LDRS-only
    if (r.currency) cur = String(r.currency).toUpperCase();
    const c = campMap.get(name) ?? zero();
    c.spend += num(r.spend);
    c.impressions += num(r.impressions);
    c.clicks += num(r.clicks);
    c.reach += num(r.reach);
    c.installs += num(r[F.install]);
    c.registrations += num(r[F.reg]);
    c.purchases += num(r[F.purch]);
    c.leads += num(r[F.lead]);
    campMap.set(name, c);
  }

  const campaigns: AppCampaign[] = [...campMap].map(([name, c]) => {
    const spend = toIls(c.spend, cur);
    return {
      name,
      type: classifyType(name),
      spend: Math.round(spend),
      impressions: Math.round(c.impressions),
      clicks: Math.round(c.clicks),
      reach: Math.round(c.reach),
      ctr: c.impressions ? c.clicks / c.impressions : null,
      cpc: c.clicks ? spend / c.clicks : null,
      installs: Math.round(c.installs),
      registrations: Math.round(c.registrations),
      purchases: Math.round(c.purchases),
      leads: Math.round(c.leads),
      cpi: c.installs ? spend / c.installs : null,
      cpReg: c.registrations ? spend / c.registrations : null,
      cpPurch: c.purchases ? spend / c.purchases : null,
      cpLead: c.leads ? spend / c.leads : null,
      cpm: c.impressions ? (spend / c.impressions) * 1000 : null,
    };
  });

  const tSum = campaigns.reduce(
    (a, c) => {
      a.spend += c.spend; a.impressions += c.impressions; a.clicks += c.clicks; a.reach += c.reach;
      a.installs += c.installs; a.registrations += c.registrations; a.purchases += c.purchases; a.leads += c.leads;
      return a;
    },
    zero(),
  );
  const totals = derive(tSum);

  // Trend (LDRS-only), daily spend + the section's main conversion.
  const mainConv = (c: ReturnType<typeof zero>) => (cfg.kind === "leads" ? c.leads : c.installs + c.registrations);
  const trend: { date: string; spend: number; conversions: number }[] = [];
  try {
    const drows = await fetchWindsor({
      connector: "facebook",
      fields: ["date", "account_id", "campaign", "spend", F.install, F.reg, F.lead],
      dateFrom: from,
      dateTo: to,
      accounts: [account],
      cacheSeconds: 60,
    });
    const byDate = new Map<string, { spend: number; conv: number }>();
    for (const r of drows) {
      if (normId(r.account_id) !== acc) continue;
      if (!String(r.campaign ?? "").startsWith("LDRS")) continue;
      const d = String(r.date ?? "").slice(0, 10);
      if (!d) continue;
      const e = byDate.get(d) ?? { spend: 0, conv: 0 };
      e.spend += toIls(num(r.spend), cur);
      e.conv += cfg.kind === "leads" ? num(r[F.lead]) : num(r[F.install]) + num(r[F.reg]);
      byDate.set(d, e);
    }
    for (const [date, e] of [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1))) trend.push({ date, spend: Math.round(e.spend), conversions: Math.round(e.conv) });
  } catch {
    /* optional */
  }

  // Pacing / projection (ads only) — MTD run-rate to end of month.
  let pacing: AppSection["pacing"] = null;
  try {
    const { monthStart, elapsed, daysInMonth } = monthProgress();
    const lastComplete = shiftDate(today(), -1);
    const mrows = await fetchWindsor({
      connector: "facebook",
      fields: ["account_id", "campaign", "spend", F.install, F.reg, F.lead],
      dateFrom: monthStart,
      dateTo: lastComplete >= monthStart ? lastComplete : monthStart,
      accounts: [account],
      cacheSeconds: 300,
    });
    let mSpend = 0, mConv = 0;
    for (const r of mrows) {
      if (normId(r.account_id) !== acc) continue;
      if (!String(r.campaign ?? "").startsWith("LDRS")) continue;
      mSpend += toIls(num(r.spend), cur);
      mConv += cfg.kind === "leads" ? num(r[F.lead]) : num(r[F.install]) + num(r[F.reg]);
    }
    const elapsedComplete = Math.max(1, elapsed - 1);
    const factor = daysInMonth / elapsedComplete;
    pacing = {
      monthSpend: Math.round(mSpend),
      elapsed: elapsedComplete,
      daysInMonth,
      projectedSpend: Math.round(mSpend * factor),
      projectedConversions: Math.round(mConv * factor),
    };
  } catch {
    /* optional */
  }

  return { key: cfg.key, title: cfg.title, kind: cfg.kind, budget: cfg.budget ?? 0, totals, campaigns, trend, pacing };
}

export async function getAppReport(brand: BrandConfig, from: string, to: string): Promise<AppReport | null> {
  if (!brand.appSections?.length) return null;
  const sections = await Promise.all(brand.appSections.map((s) => fetchSection(s, brand, from, to)));
  return { sections };
}
