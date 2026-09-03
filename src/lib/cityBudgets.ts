// Current daily budget per city, read from the live Meta campaigns — so the client can see what a
// city is set to today before asking to change it.
//
// Budgets are current-state, not time-series, so one complete day of rows is enough. Meta returns
// them in the account currency's minimum denomination (agorot for ILS), hence /100. Haat runs
// ad-set level budgets (ABO) on every campaign today, but campaign-level (CBO) is handled too:
// with CBO the campaign budget replaces its ad sets' rather than adding to them.
import type { BrandConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { parseCity } from "./appRows";
import { cityLabel } from "./haatRegions";
import { today, shiftDate } from "./dates";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();

export async function getCityDailyBudgets(brand: BrandConfig): Promise<Record<string, number>> {
  const appSec = brand.appSections?.find((s) => s.kind === "app");
  if (!appSec) return {};

  const day = shiftDate(today(), -1); // last complete day
  const rows = await fetchWindsor({
    connector: "facebook",
    fields: ["account_id", "campaign", "adset_name", "campaign_daily_budget", "adset_daily_budget", "campaign_status"],
    dateFrom: day,
    dateTo: day,
    accounts: [appSec.account],
    cacheSeconds: 900,
  }).catch(() => []);

  const acc = normId(appSec.account);
  // Collapse to one entry per campaign: its own budget (CBO) plus the max seen per ad set (ABO).
  const camps = new Map<string, { city: string | null; campBudget: number; adsets: Map<string, number> }>();
  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const name = String(r.campaign ?? "");
    if (!name.startsWith("LDRS")) continue;
    if (String(r.campaign_status ?? "").toUpperCase() !== "ACTIVE") continue;
    let e = camps.get(name);
    if (!e) { e = { city: parseCity(name), campBudget: 0, adsets: new Map() }; camps.set(name, e); }
    e.campBudget = Math.max(e.campBudget, num(r.campaign_daily_budget));
    const adset = String(r.adset_name ?? "—");
    e.adsets.set(adset, Math.max(e.adsets.get(adset) ?? 0, num(r.adset_daily_budget)));
  }

  const out: Record<string, number> = {};
  for (const e of camps.values()) {
    if (!e.city) continue;
    const minor = e.campBudget > 0
      ? e.campBudget // CBO: the campaign budget is shared by all its ad sets
      : [...e.adsets.values()].reduce((a, b) => a + b, 0);
    const label = cityLabel(e.city);
    out[label] = (out[label] ?? 0) + minor / 100;
  }
  return out;
}
