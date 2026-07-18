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
const sev = (s: Alert["severity"]) => (s === "critical" ? "🔴" : s === "warning" ? "🟠" : "🔵");

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

export async function buildDigest(alerts?: Alert[]): Promise<string> {
  const day = shiftDate(today(), -1); // yesterday (last full day)
  const [metrics, openAlerts] = await Promise.all([
    getBrandMetrics(day, day),
    alerts ? Promise.resolve(alerts) : collectAlerts(),
  ]);
  const { elapsed, daysInMonth } = monthProgress();

  const rows: string[][] = [];
  for (const brand of BRANDS) {
    const m = metrics.find((x) => x.brandId === brand.id);
    if (!m) continue;
    const orders = Math.round(m.channels.site.purchases);
    let pace = "—";
    if (brand.monthlyBudget > 0) {
      const monthSpend = await getBrandMonthSpend(brand.id);
      const p = computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth);
      pace = p.pacePct === null ? "—" : `${Math.round(p.pacePct)}%`;
    }
    const trend = deltaArrow(m.blendedRoas, m.previous?.blendedRoas ?? null);
    rows.push([
      brand.name,
      ils(m.total.spend),
      roas(m.total.roas),
      `${roas(m.blendedRoas)}${trend ? " " + trend : ""}`,
      String(orders),
      pace,
    ]);
  }

  const lines: string[] = [];
  lines.push(`☀️ **Leaders — Daily recap** · ${day}`);
  lines.push(monoTable(
    ["Brand", "Spend", "ROAS", "Blended", "Orders", "Pace"],
    rows,
    ["l", "r", "r", "r", "r", "r"],
  ));
  lines.push("_Blended = store revenue ÷ ad spend · ▲▼ = vs previous day · Pace = MTD vs budget_");

  if (openAlerts.length) {
    lines.push("");
    lines.push(`⚠️ **Needs attention (${openAlerts.length})**`);
    for (const a of openAlerts.slice(0, 20)) lines.push(`${sev(a.severity)} ${a.brandName} · ${a.detail}`);
    if (openAlerts.length > 20) lines.push(`…and ${openAlerts.length - 20} more`);
  } else {
    lines.push("");
    lines.push("✅ No open alerts.");
  }

  return lines.join("\n");
}

// One compact message from a batch of freshly-fired alerts (used by the alerts cron).
export function formatAlertBatch(alerts: Alert[]): string {
  const lines = [`🚨 **New alerts** (${alerts.length})`];
  for (const a of alerts) lines.push(`${sev(a.severity)} [${a.brandName}] ${a.detail}`);
  return lines.join("\n");
}
