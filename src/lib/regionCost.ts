// Haat "cost per registration by region" — the client wants at-a-glance visibility into what a
// registration costs in each city right now (last 3 days) vs the start of the month + the month
// average, so spikes (e.g. a region jumping from ₪3.75 to ₪40) stand out and can be acted on.
import type { BrandConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { parseCity } from "./appRows";
import { today, shiftDate } from "./dates";

const F_REG = "actions_complete_registration";
const F_INSTALL = "actions_mobile_app_install";
const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const toIls = (v: number, cur: string) => (cur === "USD" ? v * 3 : v);
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}

export interface RegionWindow { spend: number; regs: number; installs: number; cpr: number | null }
export interface RegionRow { city: string; recent: RegionWindow; base: RegionWindow; deltaPct: number | null }
export interface UacPoint { date: string; cpr: number | null }
export interface RegionCostReport {
  recentFrom: string; recentTo: string; baseFrom: string; baseTo: string;
  rows: RegionRow[];
  totalRecent: RegionWindow; totalBase: RegionWindow; totalMonth: RegionWindow; deltaPct: number | null;
  daily: UacPoint[]; // UAC (cost per registration) per day, month-to-date
}

const cprOf = (w: { spend: number; regs: number }): number | null => (w.regs ? w.spend / w.regs : null);

export async function getRegionCostReport(brand: BrandConfig): Promise<RegionCostReport | null> {
  const appSec = brand.appSections?.find((s) => s.kind === "app");
  if (!appSec) return null;

  const t = today();
  const recentTo = shiftDate(t, -1); // last complete day (yesterday)
  const recentFrom = shiftDate(t, -3); // last 3 days
  const baseFrom = t.slice(0, 8) + "01"; // 1st of the month
  const baseTo = shiftDate(baseFrom, 2); // first 3 days of the month
  const from = baseFrom < recentFrom ? baseFrom : recentFrom;

  const rows = await fetchWindsor({
    connector: "facebook",
    fields: ["date", "account_id", "currency", "campaign", "spend", F_REG, F_INSTALL],
    dateFrom: from,
    dateTo: recentTo,
    accounts: [appSec.account],
    options: { attribution_window: "7d_click,1d_view" },
    cacheSeconds: 1800,
  }).catch(() => []);

  const acc = normId(appSec.account);
  const nativeCur = brand.nativeCurrency as string;
  const empty = (): RegionWindow => ({ spend: 0, regs: 0, installs: 0, cpr: null });
  const byCity = new Map<string, { recent: RegionWindow; base: RegionWindow }>();
  const byDate = new Map<string, { spend: number; regs: number }>();
  const totalRecent = empty();
  const totalBase = empty();
  const totalMonth = empty();
  const bucket = (w: RegionWindow, tot: RegionWindow, spend: number, regs: number, installs: number) => {
    w.spend += spend; w.regs += regs; w.installs += installs;
    tot.spend += spend; tot.regs += regs; tot.installs += installs;
  };

  for (const r of rows) {
    if (normId(r.account_id) !== acc) continue;
    const name = String(r.campaign ?? "");
    if (!name.startsWith("LDRS")) continue;
    const city = parseCity(name);
    if (!city) continue;
    const d = String(r.date ?? "").slice(0, 10);
    const inRecent = d >= recentFrom && d <= recentTo;
    const inBase = d >= baseFrom && d <= baseTo;
    const inMonth = d >= baseFrom && d <= recentTo;
    const spend = toIls(num(r.spend), String(r.currency ?? nativeCur).toUpperCase());
    const regs = sumAction(r[F_REG]);
    const installs = sumAction(r[F_INSTALL]);
    if (inMonth) {
      totalMonth.spend += spend; totalMonth.regs += regs; totalMonth.installs += installs;
      const dd = byDate.get(d) ?? { spend: 0, regs: 0 }; dd.spend += spend; dd.regs += regs; byDate.set(d, dd);
    }
    if (!inRecent && !inBase) continue;
    let e = byCity.get(city);
    if (!e) { e = { recent: empty(), base: empty() }; byCity.set(city, e); }
    if (inRecent) bucket(e.recent, totalRecent, spend, regs, installs);
    if (inBase) bucket(e.base, totalBase, spend, regs, installs);
  }

  const rowsOut: RegionRow[] = [...byCity].map(([city, e]) => {
    const recent = { ...e.recent, cpr: cprOf(e.recent) };
    const base = { ...e.base, cpr: cprOf(e.base) };
    const deltaPct = recent.cpr != null && base.cpr != null && base.cpr > 0 ? ((recent.cpr - base.cpr) / base.cpr) * 100 : null;
    return { city, recent, base, deltaPct };
  });
  rowsOut.sort((a, b) => {
    const av = a.deltaPct ?? (a.recent.regs ? -1 : -1000);
    const bv = b.deltaPct ?? (b.recent.regs ? -1 : -1000);
    return bv - av;
  });

  totalRecent.cpr = cprOf(totalRecent);
  totalBase.cpr = cprOf(totalBase);
  totalMonth.cpr = cprOf(totalMonth);
  const deltaPct = totalRecent.cpr != null && totalBase.cpr != null && totalBase.cpr > 0 ? ((totalRecent.cpr - totalBase.cpr) / totalBase.cpr) * 100 : null;
  const daily: UacPoint[] = [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, w]) => ({ date, cpr: w.regs ? w.spend / w.regs : null }));

  return { recentFrom, recentTo, baseFrom, baseTo, rows: rowsOut, totalRecent, totalBase, totalMonth, deltaPct, daily };
}
