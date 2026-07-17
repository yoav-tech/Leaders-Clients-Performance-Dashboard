import type { ChannelMetrics } from "./types";

export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function emptyChannel(channel: ChannelMetrics["channel"]): ChannelMetrics {
  return {
    channel,
    spend: 0,
    purchases: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    cpa: null,
    roas: null,
    aov: null,
    ctr: null,
    cpc: null,
    cpm: null,
    cvr: null,
  };
}

// Given summed spend/purchases/revenue/impressions/clicks, attach the derived ratios.
export function withRatios(
  channel: ChannelMetrics["channel"],
  spend: number,
  purchases: number,
  revenue: number,
  impressions = 0,
  clicks = 0,
): ChannelMetrics {
  return {
    channel,
    spend,
    purchases,
    revenue,
    impressions,
    clicks,
    cpa: ratio(spend, purchases),
    roas: ratio(revenue, spend),
    aov: ratio(revenue, purchases),
    ctr: ratio(clicks, impressions),
    cpc: ratio(spend, clicks),
    cpm: impressions ? (spend / impressions) * 1000 : null,
    cvr: ratio(purchases, clicks),
  };
}

// Percentage change vs a previous value (null when there's no comparable base).
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Direction-aware tone for a KPI's delta. For most metrics up is good; for cost/efficiency
// metrics (spend, CPA, CPC, CPM, CAC) down is good.
const LOWER_IS_BETTER = new Set(["spend", "cpa", "cpc", "cpm", "cac"]);
export function deltaTone(metric: string, delta: number | null): "good" | "bad" | "none" {
  if (delta === null || delta === 0) return "none";
  const up = delta > 0;
  const good = LOWER_IS_BETTER.has(metric) ? !up : up;
  return good ? "good" : "bad";
}

const ilsFmt = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const numFmt = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });

export function formatIls(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return ilsFmt.format(value);
}

export function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return numFmt.format(value);
}

export function formatRoas(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

// A 0..1 ratio (e.g. CTR, CVR) as a percentage.
export function formatPct(ratio01: number | null, digits = 1): string {
  if (ratio01 === null || Number.isNaN(ratio01)) return "—";
  return `${(ratio01 * 100).toFixed(digits)}%`;
}

// A period-over-period delta (already a percentage) with an explicit sign.
export function formatDelta(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

// Monthly budget pacing.
export interface Pacing {
  budget: number;
  spend: number; // month-to-date ad spend
  expected: number; // budget prorated to elapsed days
  projected: number; // end-of-month projection at current daily rate
  pacePct: number | null; // spend / expected × 100 (>100 = spending ahead of plan)
}

export function computePacing(
  budget: number,
  monthSpend: number,
  elapsed: number,
  daysInMonth: number,
): Pacing {
  const expected = budget * (elapsed / daysInMonth);
  const projected = elapsed ? (monthSpend / elapsed) * daysInMonth : 0;
  return {
    budget,
    spend: monthSpend,
    expected,
    projected,
    pacePct: expected ? (monthSpend / expected) * 100 : null,
  };
}

// Color for a ROAS value relative to a target (mirrors the sheet's green/red bands).
export function roasTone(roas: number | null, target: number): "good" | "warn" | "bad" | "none" {
  if (roas === null) return "none";
  if (roas >= target) return "good";
  if (roas >= target * 0.7) return "warn";
  return "bad";
}
