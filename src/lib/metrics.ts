import type { ChannelMetrics } from "./types";

export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function emptyChannel(channel: ChannelMetrics["channel"]): ChannelMetrics {
  return { channel, spend: 0, purchases: 0, revenue: 0, cpa: null, roas: null, aov: null };
}

// Given summed spend/purchases/revenue, attach the derived ratios.
export function withRatios(
  channel: ChannelMetrics["channel"],
  spend: number,
  purchases: number,
  revenue: number,
): ChannelMetrics {
  return {
    channel,
    spend,
    purchases,
    revenue,
    cpa: ratio(spend, purchases),
    roas: ratio(revenue, spend),
    aov: ratio(revenue, purchases),
  };
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

// Color for a ROAS value relative to a target (mirrors the sheet's green/red bands).
export function roasTone(roas: number | null, target: number): "good" | "warn" | "bad" | "none" {
  if (roas === null) return "none";
  if (roas >= target) return "good";
  if (roas >= target * 0.7) return "warn";
  return "bad";
}
