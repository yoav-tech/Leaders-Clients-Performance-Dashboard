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
const pctv = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const sev = (s: Alert["severity"]) => (s === "critical" ? "🔴" : s === "warning" ? "🟠" : "🔵");

// Signed delta like "+18%" / "−5%" (blank when incomparable).
function delta(cur: number | null, prev: number | null): string {
  const d = deltaPct(cur, prev);
  if (d === null) return "";
  const r = Math.round(d);
  return `${r >= 0 ? "+" : "−"}${Math.abs(r)}%`;
}

export async function buildDigest(alerts?: Alert[]): Promise<string> {
  const day = shiftDate(today(), -1); // yesterday (last full day)
  const [metrics, openAlerts] = await Promise.all([
    getBrandMetrics(day, day),
    alerts ? Promise.resolve(alerts) : collectAlerts(),
  ]);
  const { elapsed, daysInMonth } = monthProgress();

  const lines: string[] = [];
  lines.push(`☀️ **Leaders — Daily recap** · ${day}`);
  lines.push("");

  for (const brand of BRANDS) {
    const m = metrics.find((x) => x.brandId === brand.id);
    if (!m) continue;
    const p = m.previous;
    const orders = m.channels.site.purchases;
    const cvr = m.total.clicks ? orders / m.total.clicks : null;

    lines.push(
      `**${brand.name}** — ${ils(m.total.spend)} spend · ROAS ${roas(m.total.roas)} · Blended ${roas(m.blendedRoas)} · ${Math.round(orders)} orders · CVR ${pctv(cvr)}`,
    );
    const dSpend = delta(m.total.spend, p?.spend ?? null);
    const dRoas = delta(m.blendedRoas, p?.blendedRoas ?? null);
    const dRev = delta(m.channels.site.revenue, p?.siteRevenue ?? null);
    let pacing = "";
    if (brand.monthlyBudget > 0) {
      const monthSpend = await getBrandMonthSpend(brand.id);
      const pace = computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth);
      pacing = ` · pacing ${pace.pacePct === null ? "—" : Math.round(pace.pacePct) + "%"} (proj ${ils(pace.projected)}/${ils(brand.monthlyBudget)})`;
    }
    lines.push(`   ↳ vs prev day — spend ${dSpend || "—"} · blended ROAS ${dRoas || "—"} · store rev ${dRev || "—"}${pacing}`);
  }

  if (openAlerts.length) {
    lines.push("");
    lines.push(`⚠️ **Needs attention** (${openAlerts.length})`);
    for (const a of openAlerts.slice(0, 20)) {
      lines.push(`${sev(a.severity)} [${a.brandName}] ${a.detail}`);
    }
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
