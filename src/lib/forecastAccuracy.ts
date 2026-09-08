// How much to trust a month-end forecast, measured rather than assumed.
//
// Backtesting August showed the projection method is not the problem: a flat trailing-7 run rate
// beat damped week-on-week growth, a linear trend, and day-of-week weighting on all three stores.
// The error tracks how volatile the store's daily revenue is — Argania at 34% day-to-day variation
// forecasts within 6%, Studio Pasha at 167% within 48% — so the same number means very different
// things per brand and has to carry its own accuracy.
//
// A statistical band from daily deviation was also tested and rejected: it covered the actual only
// 5-41% of the time, because the error is systematic drift through the month, not independent
// daily noise. What does work is the brand's own recent forecast error.
import { getSupabase, hasDb } from "./db";
import { unstable_cache } from "next/cache";

export interface ForecastAccuracy {
  month: string;       // the month backtested
  maePct: number;      // mean absolute error, days 7-28
  biasPct: number;     // signed — negative means it under-forecasts
  dailyCvPct: number;  // day-to-day variation, the driver of the error
  samples: number;
}

const _accuracy = async (brandId: string, month: string): Promise<ForecastAccuracy | null> => {
  if (!hasDb()) return null;
  const start = `${month}-01`;
  const endD = new Date(`${month}-01T00:00:00Z`);
  endD.setUTCMonth(endD.getUTCMonth() + 1); endD.setUTCDate(0);
  const end = endD.toISOString().slice(0, 10);
  const dim = endD.getUTCDate();
  // Reach back a fortnight so the trailing window is complete on day 1.
  const backD = new Date(`${month}-01T00:00:00Z`); backD.setUTCDate(backD.getUTCDate() - 14);

  const { data, error } = await getSupabase()
    .from("daily_metrics").select("date,revenue_ils")
    .eq("brand_id", brandId).eq("channel", "site")
    .gte("date", backD.toISOString().slice(0, 10)).lte("date", end).order("date");
  if (error || !data?.length) return null;

  const day = new Map<string, number>();
  for (const r of data) day.set(String(r.date).slice(0, 10), Number(r.revenue_ils));
  const all = [...day.keys()].sort();
  const inMonth = all.filter((d) => d >= start && d <= end);
  if (inMonth.length < dim - 1) return null; // month not complete — nothing to learn from yet

  const actual = inMonth.reduce((a, d) => a + day.get(d)!, 0);
  if (actual <= 0) return null;

  const errs: number[] = [];
  for (const d of inMonth) {
    const elapsed = Number(d.slice(8, 10));
    if (elapsed < 7 || elapsed > dim - 3) continue;
    const mtd = inMonth.filter((x) => x <= d).reduce((a, x) => a + day.get(x)!, 0);
    const i = all.indexOf(d);
    const w7 = all.slice(Math.max(0, i - 6), i + 1).map((x) => day.get(x)!);
    const r7 = w7.reduce((a, b) => a + b, 0) / w7.length;
    const forecast = mtd + r7 * (dim - elapsed);
    errs.push(((forecast - actual) / actual) * 100);
  }
  if (!errs.length) return null;

  const vals = inMonth.map((d) => day.get(d)!);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);

  return {
    month,
    maePct: errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length,
    biasPct: errs.reduce((a, e) => a + e, 0) / errs.length,
    dailyCvPct: mean ? (sd / mean) * 100 : 0,
    samples: errs.length,
  };
};

export const forecastAccuracy = unstable_cache(_accuracy, ["forecast-accuracy-v1"], { revalidate: 86400, tags: ["metrics"] });

/** The month before the one given (YYYY-MM), which is the most recent complete one. */
export function previousMonth(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
