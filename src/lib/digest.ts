// Deterministic morning digest for the ClickUp channel. No LLM — a structured markdown
// recap of yesterday per brand (KPIs + deltas + pacing) plus an "attention" list of open
// alerts. Reuses getBrandMetrics + computePacing + the alert engine.

import { BRANDS } from "./brands";
import { getBrandMetrics, getBrandMonthSpend } from "./queries";
import { computePacing, deltaPct } from "./metrics";
import { monthProgress, shiftDate, today } from "./dates";
import { collectAlerts, type Alert } from "./alerts";

const ils = (v: number | null) => (v === null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const roas = (v: number | null) => (v === null ? "—" : v.toFixed(1));

const SEV_RANK: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };
const sevDot = (s: Alert["severity"]) => (s === "critical" ? "🔴" : s === "warning" ? "🟡" : "🔵");

// Group alerts by brand — a worst-severity header per brand, then its issues bulleted.
// Keeps the channel a clean, scannable summary instead of a wall of per-ad lines.
export function groupAlerts(alerts: Alert[]): string {
  const order: string[] = [];
  const byBrand = new Map<string, Alert[]>();
  for (const a of alerts) {
    if (!byBrand.has(a.brandName)) { byBrand.set(a.brandName, []); order.push(a.brandName); }
    byBrand.get(a.brandName)!.push(a);
  }
  const blocks: string[] = [];
  for (const brand of order) {
    const list = byBrand.get(brand)!.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    blocks.push(`${sevDot(list[0].severity)} **${brand}**`);
    for (const a of list) blocks.push(`   • ${a.detail}`);
  }
  return blocks.join("\n");
}

// Signed delta arrow like "▲18%" / "▼5%" (blank when incomparable).
function deltaArrow(cur: number | null, prev: number | null): string {
  const d = deltaPct(cur, prev);
  if (d === null) return "";
  const r = Math.round(d);
  return `${r >= 0 ? "▲" : "▼"}${Math.abs(r)}%`;
}

function pad(s: string, width: number, align: "l" | "r" = "r"): string {
  if (s.length >= width) return s;
  const fill = " ".repeat(width - s.length);
  return align === "l" ? s + fill : fill + s;
}

// Render rows as a fixed-width monospace table (ClickUp renders ``` blocks in monospace,
// so columns line up — unlike Markdown pipe tables, which ClickUp does not render).
function monoTable(headers: string[], rows: string[][], aligns: ("l" | "r")[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i], aligns[i])).join("  ").replace(/\s+$/, "");
  return ["```", line(headers), ...rows.map(line), "```"].join("\n");
}

// Structured daily-recap data — one source for both the ClickUp text and the HTML email.
export interface DigestRow {
  name: string;
  spend: number;
  revenue: number; // store revenue
  blended: number | null; // store revenue ÷ ad spend
  blendedPrev: number | null;
  orders: number;
  pacePct: number | null;
  target: number;
  conversion: boolean; // false for awareness/app/perf brands (no store outcome → dash rev/ROAS/orders)
}
export interface DigestData {
  day: string;
  rows: DigestRow[];
  alerts: Alert[];
}

export async function getDigestData(alerts?: Alert[]): Promise<DigestData> {
  const day = shiftDate(today(), -1); // yesterday (last full day)
  const [metrics, openAlerts] = await Promise.all([
    getBrandMetrics(day, day),
    alerts ? Promise.resolve(alerts) : collectAlerts(),
  ]);
  const { elapsed, daysInMonth } = monthProgress();

  const rows: DigestRow[] = [];
  for (const brand of BRANDS) {
    const m = metrics.find((x) => x.brandId === brand.id);
    if (!m) continue;
    // Only clients that actually have data in the daily pipeline. awareness/perf/snapshot brands
    // (colgate/scj/leaders/bestie) aren't ingested → they'd show a FALSE ₪0, so skip them here.
    const hasData = m.total.spend > 0 || m.total.impressions > 0 || m.total.clicks > 0 || m.channels.site.revenue > 0;
    if (!hasData) continue;
    const conversion = !(brand.mediaPlan || brand.appInstall || brand.awarenessSources || brand.googleSnapshot || brand.perfSources);
    let pacePct: number | null = null;
    if (brand.monthlyBudget > 0) {
      const monthSpend = await getBrandMonthSpend(brand.id);
      pacePct = computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth).pacePct;
    }
    rows.push({
      name: brand.name,
      spend: m.total.spend,
      revenue: m.channels.site.revenue,
      blended: m.blendedRoas,
      blendedPrev: m.previous?.blendedRoas ?? null,
      orders: Math.round(m.channels.site.purchases),
      pacePct,
      target: brand.targetRoas,
      conversion,
    });
  }
  return { day, rows, alerts: openAlerts };
}

// ClickUp markdown recap (mono table + grouped alerts).
export function renderDigestText(data: DigestData): string {
  const tableRows = data.rows.map((r) => {
    const trend = deltaArrow(r.blended, r.blendedPrev);
    return [
      r.name,
      ils(r.spend),
      r.conversion ? ils(r.revenue) : "—",
      r.conversion ? `${roas(r.blended)}${trend ? " " + trend : ""}` : "—",
      r.conversion ? String(r.orders) : "—",
      r.pacePct === null ? "—" : `${Math.round(r.pacePct)}%`,
    ];
  });
  const lines: string[] = [];
  lines.push(`☀️ **Leaders — Daily recap** · ${data.day}`);
  lines.push(monoTable(["Brand", "Spend", "Revenue", "ROAS", "Orders", "Pace"], tableRows, ["l", "r", "r", "r", "r", "r"]));
  lines.push("_Revenue = store revenue · ROAS = revenue ÷ spend · ▲▼ vs previous day · Pace = MTD vs budget_");
  if (data.alerts.length) lines.push("", `⚠️ **Needs attention**`, groupAlerts(data.alerts));
  else lines.push("", "✅ No open alerts.");
  return lines.join("\n");
}

export async function buildDigest(alerts?: Alert[]): Promise<string> {
  return renderDigestText(await getDigestData(alerts));
}

// One compact message from a batch of freshly-fired alerts (used by the alerts cron).
export function formatAlertBatch(alerts: Alert[]): string {
  return [`🚨 **New alerts** · ${shiftDate(today(), -1)}`, groupAlerts(alerts)].join("\n");
}
