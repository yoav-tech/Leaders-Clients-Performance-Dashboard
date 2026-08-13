// Daily digest split by client type: e-commerce, views (awareness), leads, and impression-share.
// E-commerce comes from the ingested daily_metrics; the others are pulled live from Windsor
// (reusing the same report libs the dashboard views use), for yesterday.
import { BRANDS, reportGroupOf } from "./brands";
import { getBrandMetrics, getBrandMonthSpend } from "./queries";
import { computePacing } from "./metrics";
import { monthProgress, shiftDate, today } from "./dates";
import { collectAlerts, type Alert } from "./alerts";
import { getAwarenessReport } from "./awarenessReport";
import { getCampaignPerf } from "./campaignPerf";
import { getAppReport } from "./appReport";
import { getSearchSnapshot } from "./searchSnapshot";
import { eurIlsRate } from "./fx";
import { groupAlerts } from "./digest";

export interface EcomRow { name: string; spend: number; revenue: number; blended: number | null; blendedPrev: number | null; orders: number; pacePct: number | null; target: number }
export interface ViewsRow { name: string; spend: number; impressions: number; views: number | null; cpv: number | null }
export interface LeadsRow { name: string; spend: number; leads: number; cpl: number | null }
// App clients (Haat) — the KPI is installs/CPI (app registrations & downloads), NOT leads; the HR
// recruitment section keeps its own leads/CPL. Kept separate from the leads table.
export interface AppRow { name: string; spend: number; installs: number; cpi: number | null; leads: number; cpl: number | null }
export interface ImpShareRow { name: string; impShare: number | null; spend: number; clicks: number; cpc: number | null }

export interface GroupedDigest {
  day: string; // the range end (yesterday) — kept for compatibility
  from: string;
  to: string;
  period: "day" | "week";
  ecom: EcomRow[];
  views: ViewsRow[];
  leads: LeadsRow[];
  app: AppRow[];
  impshare: ImpShareRow[];
  alerts: Alert[];
}

// Colgate campaign-type codes (per the account naming), for the per-type impression-share breakdown.
const TYPE_CODE: Record<string, string> = { compete: "CPT", lead: "LED", participate: "PTP", compete_site: "CPS", other: "—" };

export async function getGroupedDigest(alerts?: Alert[]): Promise<GroupedDigest> {
  // Thursday = a snapshot of the whole past week; Sunday = the weekend (Fri + Sat, since there's no
  // report on those days); Mon–Wed = yesterday only.
  const t = today();
  const dow = new Date(t + "T00:00:00Z").getUTCDay(); // 0=Sun … 4=Thu … 6=Sat
  const to = shiftDate(t, -1);
  let from = to;
  let period: "day" | "week" = "day";
  if (dow === 4) { from = shiftDate(t, -7); period = "week"; } // Thursday → past week
  else if (dow === 0) { from = shiftDate(t, -2); }             // Sunday → Fri + Sat

  const [metrics, openAlerts] = await Promise.all([
    getBrandMetrics(from, to),
    alerts ? Promise.resolve(alerts) : collectAlerts(),
  ]);
  const { elapsed, daysInMonth } = monthProgress();

  const ecom: EcomRow[] = [];
  const views: ViewsRow[] = [];
  const leads: LeadsRow[] = [];
  const app: AppRow[] = [];
  const impshare: ImpShareRow[] = [];
  const jobs: Promise<void>[] = [];

  for (const brand of BRANDS) {
    const group = reportGroupOf(brand);
    const m = metrics.find((x) => x.brandId === brand.id);

    if (group === "ecommerce") {
      if (!m) continue;
      if (!(m.total.spend > 0 || m.total.impressions > 0 || m.channels.site.revenue > 0)) continue;
      let pacePct: number | null = null;
      if (brand.monthlyBudget > 0) {
        const ms = await getBrandMonthSpend(brand.id);
        pacePct = computePacing(brand.monthlyBudget, ms, elapsed, daysInMonth).pacePct;
      }
      ecom.push({ name: brand.name, spend: m.total.spend, revenue: m.channels.site.revenue, blended: m.blendedRoas, blendedPrev: m.previous?.blendedRoas ?? null, orders: Math.round(m.channels.site.purchases), pacePct, target: brand.targetRoas });
    } else if (group === "views") {
      if (brand.awarenessSources) {
        jobs.push(getAwarenessReport(brand, from, to).then((r) => {
          if (r && (r.totals.spend > 0 || r.totals.impressions > 0)) views.push({ name: brand.name, spend: r.totals.spend, impressions: r.totals.impressions, views: r.totals.views, cpv: r.totals.cpv });
        }).catch(() => {}));
      } else if (m && (m.total.spend > 0 || m.total.impressions > 0)) {
        // Style (media plan) — spend + impressions from the daily pipeline; views aren't ingested.
        views.push({ name: brand.name, spend: m.total.spend, impressions: m.total.impressions, views: null, cpv: null });
      }
    } else if (group === "leads" && brand.appInstall) {
      // Haat is an APP client — its KPI is installs/CPI (registrations & downloads), not leads. It
      // gets its own table. Spend = total ad spend; CPI from the app section; leads/CPL from the HR
      // (recruitment) section, kept as a secondary metric on the same row.
      jobs.push(getAppReport(brand, from, to).then((r) => {
        if (!r) return;
        const appSecs = r.sections.filter((s) => s.kind === "app");
        const leadSecs = r.sections.filter((s) => s.kind === "leads");
        const totalSpend = r.sections.reduce((s, x) => s + x.totals.spend, 0);
        const appSpend = appSecs.reduce((s, x) => s + x.totals.spend, 0);
        const installs = appSecs.reduce((s, x) => s + x.totals.installs, 0);
        const hrSpend = leadSecs.reduce((s, x) => s + x.totals.spend, 0);
        const hrLeads = leadSecs.reduce((s, x) => s + x.totals.leads, 0);
        if (totalSpend > 0 || installs > 0 || hrLeads > 0) {
          app.push({ name: brand.name, spend: totalSpend, installs: Math.round(installs), cpi: installs ? appSpend / installs : null, leads: Math.round(hrLeads), cpl: hrLeads ? hrSpend / hrLeads : null });
        }
      }).catch(() => {}));
    } else if (group === "leads") {
      if (brand.perfSources) {
        jobs.push(getCampaignPerf(brand, from, to).then((r) => {
          if (!r) return;
          const spend = r.sources.reduce((s, x) => s + x.totals.spend, 0);
          const ld = r.sources.reduce((s, x) => s + x.totals.conv, 0);
          if (spend > 0 || ld > 0) leads.push({ name: brand.name, spend, leads: Math.round(ld), cpl: ld ? spend / ld : null });
        }).catch(() => {}));
      }
    } else if (group === "impshare") {
      const eur = eurIlsRate();
      // Broken down per campaign type (LED / CPT / PTP) per account, not just the account total.
      jobs.push(getSearchSnapshot(brand, from, to).then((r) => {
        if (!r) return;
        for (const sec of r.sections) {
          for (const row of sec.rows) {
            if (!(row.impShare != null || row.impressions > 0)) continue;
            const spend = sec.currency === "EUR" ? row.cost * eur : row.cost;
            impshare.push({ name: `${sec.title} · ${TYPE_CODE[row.type]}`, impShare: row.impShare, spend, clicks: row.clicks, cpc: row.cpc });
          }
        }
      }).catch(() => {}));
    }
  }
  await Promise.all(jobs);
  return { day: to, from, to, period, ecom, views, leads, app, impshare, alerts: openAlerts };
}

// ---- ClickUp markdown (mono tables) ----
const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pctv = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const cpvv = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(2)}`);

function pad(s: string, w: number, align: "l" | "r"): string {
  if (s.length >= w) return s;
  const fill = " ".repeat(w - s.length);
  return align === "l" ? s + fill : fill + s;
}
function mono(headers: string[], rows: string[][], aligns: ("l" | "r")[]): string {
  if (!rows.length) return "";
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i], aligns[i])).join("  ").replace(/\s+$/, "");
  return ["```", line(headers), ...rows.map(line), "```"].join("\n");
}

export function renderGroupedText(d: GroupedDigest): string {
  const title = d.period === "week"
    ? `🗓️ **דוח שבועי לקוחות לידרס** · ${d.from} – ${d.to}`
    : d.from !== d.to
      ? `☀️ **דוח סוף שבוע לקוחות לידרס** · ${d.from} – ${d.to}`
      : `☀️ **דוח יומי לקוחות לידרס** · ${d.to}`;
  const parts: string[] = [title];
  if (d.ecom.length) {
    parts.push("🛒 **איקומרס**");
    parts.push(mono(["Brand", "Spend", "Revenue", "ROAS", "Orders", "Pace"],
      d.ecom.map((r) => [r.name, ils(r.spend), ils(r.revenue), roas(r.blended), String(r.orders), r.pacePct == null ? "—" : `${Math.round(r.pacePct)}%`]),
      ["l", "r", "r", "r", "r", "r"]));
  }
  if (d.views.length) {
    parts.push("👁️ **צפיות**");
    parts.push(mono(["Brand", "Spend", "Impr", "Views", "CPV"],
      d.views.map((r) => [r.name, ils(r.spend), n0(r.impressions), n0(r.views), cpvv(r.cpv)]),
      ["l", "r", "r", "r", "r"]));
  }
  if (d.leads.length) {
    parts.push("📇 **לידים**");
    parts.push(mono(["Brand", "Spend", "Leads", "CPL"],
      d.leads.map((r) => [r.name, ils(r.spend), n0(r.leads), ils(r.cpl)]),
      ["l", "r", "r", "r"]));
  }
  if (d.app.length) {
    parts.push("📱 **אפליקציה**");
    parts.push(mono(["Brand", "Spend", "Installs", "CPI", "Leads (HR)", "CPL"],
      d.app.map((r) => [r.name, ils(r.spend), n0(r.installs), ils(r.cpi), n0(r.leads), ils(r.cpl)]),
      ["l", "r", "r", "r", "r", "r"]));
  }
  if (d.impshare.length) {
    parts.push("📊 **Impression Share** (לפי סוג קמפיין)");
    parts.push(mono(["Account · Type", "Imp Share", "Spend", "Clicks"],
      d.impshare.map((r) => [r.name, pctv(r.impShare), ils(r.spend), n0(r.clicks)]),
      ["l", "r", "r", "r"]));
  }
  parts.push(d.alerts.length ? `⚠️ **צריך תשומת לב**\n${groupAlerts(d.alerts)}` : "✅ אין התראות פתוחות.");
  return parts.join("\n");
}
