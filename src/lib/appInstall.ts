// App-install brands (e.g. Haat) — the KPI is installs/CPI, not store ROAS. Pulls live Windsor
// (Meta) app-install metrics for the selected range: totals, per-campaign, and a daily trend.

import type { BrandConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";

const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);
const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const INSTALL = "actions_mobile_app_install";
const PURCH = "actions_omni_purchase";

export interface AppCampaign {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  cpi: number | null;
  ctr: number | null;
}
export interface AppInstallStats {
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  purchases: number;
  cpi: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerPurchase: number | null;
  installRate: number | null; // installs ÷ clicks
  campaigns: AppCampaign[];
  trend: { date: string; installs: number; spend: number }[];
}

export async function getAppInstallStats(brand: BrandConfig, from: string, to: string): Promise<AppInstallStats | null> {
  if (!brand.metaAccountId) return null;
  const acc = normId(brand.metaAccountId);

  let spend = 0, impressions = 0, clicks = 0, installs = 0, purchases = 0;
  let cur = brand.nativeCurrency as string;
  const byCamp = new Map<string, { spend: number; impressions: number; clicks: number; installs: number }>();
  try {
    const rows = await fetchWindsor({
      connector: "facebook",
      fields: ["account_id", "currency", "campaign", "spend", "impressions", "clicks", INSTALL, PURCH],
      dateFrom: from,
      dateTo: to,
      accounts: [brand.metaAccountId],
      options: { attribution_window: "7d_click,1d_view" },
      cacheSeconds: 60,
    });
    for (const r of rows) {
      if (normId(r.account_id) !== acc) continue;
      if (r.currency) cur = String(r.currency).toUpperCase();
      const s = num(r.spend), im = num(r.impressions), cl = num(r.clicks), ins = num(r[INSTALL]), pu = num(r[PURCH]);
      spend += s; impressions += im; clicks += cl; installs += ins; purchases += pu;
      const name = String(r.campaign ?? "(none)") || "(none)";
      const c = byCamp.get(name) ?? { spend: 0, impressions: 0, clicks: 0, installs: 0 };
      c.spend += s; c.impressions += im; c.clicks += cl; c.installs += ins;
      byCamp.set(name, c);
    }
  } catch {
    return null;
  }

  const spendIls = toIls(spend, cur);
  const campaigns: AppCampaign[] = [...byCamp]
    .map(([name, c]) => {
      const sp = toIls(c.spend, cur);
      return {
        name,
        spend: Math.round(sp),
        impressions: Math.round(c.impressions),
        clicks: Math.round(c.clicks),
        installs: Math.round(c.installs),
        cpi: c.installs ? sp / c.installs : null,
        ctr: c.impressions ? c.clicks / c.impressions : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const trend: { date: string; installs: number; spend: number }[] = [];
  try {
    const rows = await fetchWindsor({
      connector: "facebook",
      fields: ["date", "account_id", "spend", INSTALL],
      dateFrom: from,
      dateTo: to,
      accounts: [brand.metaAccountId],
      cacheSeconds: 60,
    });
    const byDate = new Map<string, { installs: number; spend: number }>();
    for (const r of rows) {
      if (normId(r.account_id) !== acc) continue;
      const d = String(r.date ?? "").slice(0, 10);
      if (!d) continue;
      const e = byDate.get(d) ?? { installs: 0, spend: 0 };
      e.installs += num(r[INSTALL]);
      e.spend += toIls(num(r.spend), cur);
      byDate.set(d, e);
    }
    for (const [date, e] of [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      trend.push({ date, installs: Math.round(e.installs), spend: Math.round(e.spend) });
    }
  } catch {
    /* trend optional */
  }

  return {
    spend: Math.round(spendIls),
    impressions: Math.round(impressions),
    clicks: Math.round(clicks),
    installs: Math.round(installs),
    purchases: Math.round(purchases),
    cpi: installs ? spendIls / installs : null,
    ctr: impressions ? clicks / impressions : null,
    cpc: clicks ? spendIls / clicks : null,
    cpm: impressions ? (spendIls / impressions) * 1000 : null,
    costPerPurchase: purchases ? spendIls / purchases : null,
    installRate: clicks ? installs / clicks : null,
    campaigns,
    trend,
  };
}
