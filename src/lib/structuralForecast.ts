// Month-end forecast built from the funnel rather than extrapolated from revenue.
//
// Backtesting August established three things that shape this:
//
// 1. Decomposing alone changes nothing. spend × (CVR × AOV ÷ CPC) is algebraically spend × ROAS,
//    so if every component reads off the same trailing window the answer is identical to the run
//    rate — it reproduced the old error to the decimal on all three stores.
// 2. What does help is knowing the spend still to come. Replaying August with the remaining spend
//    known cut La Beaute's error from 24.8% to 15.0% and removed its bias (-11.4% to +2.1%),
//    because its spend ramped from ₪1,052 in week one to ₪18,034 in week two — something only the
//    team planning it could know in advance.
// 3. Configured monthly budgets can't stand in for that: in August Argania spent 123% of its
//    budget while La Beaute and Studio Pasha spent 71%.
//
// So the model takes planned spend where the team has entered it, falls back to the trailing rate
// where they haven't, and reports each component separately — because on a store like Studio Pasha
// (167% day-to-day variation) no model will be tight, and the useful thing is being able to see
// which part moved.
import { getSupabase, hasDb } from "./db";
import { monthProgress, shiftDate, today } from "./dates";

export interface ChannelFunnel {
  channel: string;
  spendMtd: number;
  clicks: number;
  cpc: number | null;
  orders: number;        // store orders attributed to this channel by UTM
  cvr: number | null;    // orders ÷ clicks
  aov: number | null;    // store revenue ÷ orders
  storeRoas: number | null;
  plannedSpend: number | null;   // what the team said they'd spend this month, if entered
  projectedSpend: number;        // remaining spend used by the forecast
  projectedRevenue: number;
  spendSource: "plan" | "run-rate";
}

export interface StructuralForecast {
  month: string;
  elapsedComplete: number;
  daysInMonth: number;
  daysRemaining: number;
  channels: ChannelFunnel[];
  nonPaidPerDay: number;      // organic, CRM, direct — modelled on its own run rate
  mtdStoreRevenue: number;
  projectedStoreRevenue: number;
  projectedPaidRevenue: number;
  storeAov: number | null;    // blended, across all sources
  usesPlan: boolean;
  // Set when the trailing window is unrepresentative — a sale or a launch. Any method extrapolates
  // it across the rest of the month, so the projection has to be read as "if this continues".
  // La Beaute's September promotion took daily revenue from ~₪10k to ₪261k, which projected to
  // ₪3.1m against an August of ₪557k.
  anomaly: { ratio: number; windowDaily: number; baselineDaily: number } | null;
}

export async function getMonthlySpendPlan(brandId: string, month: string): Promise<Record<string, number>> {
  if (!hasDb()) return {};
  const { data, error } = await getSupabase()
    .from("monthly_spend_plan").select("channel,planned_spend")
    .eq("brand_id", brandId).eq("month", month);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[String(r.channel)] = Number(r.planned_spend);
  return out;
}

export async function saveMonthlySpendPlan(brandId: string, month: string, plan: Record<string, number>, by: string): Promise<void> {
  if (!hasDb()) return;
  const rows = Object.entries(plan).map(([channel, planned_spend]) => ({
    brand_id: brandId, month, channel, planned_spend, updated_by: by, updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await getSupabase().from("monthly_spend_plan").upsert(rows, { onConflict: "brand_id,month,channel" });
  if (error) throw new Error(error.message);
}

export async function getStructuralForecast(brandId: string): Promise<StructuralForecast | null> {
  if (!hasDb()) return null;
  const { monthStart, elapsed, daysInMonth } = monthProgress();
  const month = monthStart.slice(0, 7);
  const lastComplete = shiftDate(today(), -1);
  const elapsedComplete = Math.max(0, elapsed - 1);
  const daysRemaining = Math.max(0, daysInMonth - elapsedComplete);
  const win7 = shiftDate(lastComplete, -6);
  const sb = getSupabase();

  const [dm, du, plan] = await Promise.all([
    sb.from("daily_metrics").select("date,channel,spend_ils,clicks,revenue_ils")
      .eq("brand_id", brandId).gte("date", win7).lte("date", lastComplete),
    sb.from("daily_utm").select("date,channel,purchases,revenue_ils")
      .eq("brand_id", brandId).gte("date", win7).lte("date", lastComplete),
    getMonthlySpendPlan(brandId, month),
  ]);
  // Month-to-date store revenue, read over the whole month rather than the window.
  const { data: mtdRows } = await sb.from("daily_metrics").select("revenue_ils,purchases")
    .eq("brand_id", brandId).eq("channel", "site").gte("date", monthStart).lte("date", lastComplete);
  const mtdStoreRevenue = (mtdRows ?? []).reduce((a, r) => a + Number(r.revenue_ils), 0);
  const mtdOrders = (mtdRows ?? []).reduce((a, r) => a + Number(r.purchases), 0);

  // Month-to-date spend per channel, so a plan can be turned into what's left.
  const { data: spendRows } = await sb.from("daily_metrics").select("channel,spend_ils")
    .eq("brand_id", brandId).neq("channel", "site").gte("date", monthStart).lte("date", lastComplete);
  const spendMtdBy: Record<string, number> = {};
  for (const r of spendRows ?? []) {
    const c = String(r.channel);
    spendMtdBy[c] = (spendMtdBy[c] ?? 0) + Number(r.spend_ils);
  }

  const ad = new Map<string, { sp: number; cl: number }>();
  let siteWin = 0;
  for (const r of dm.data ?? []) {
    const c = String(r.channel);
    if (c === "site") { siteWin += Number(r.revenue_ils); continue; }
    const e = ad.get(c) ?? { sp: 0, cl: 0 };
    e.sp += Number(r.spend_ils); e.cl += Number(r.clicks); ad.set(c, e);
  }
  const st = new Map<string, { p: number; r: number }>();
  let paidWin = 0;
  for (const r of du.data ?? []) {
    const c = String(r.channel);
    const e = st.get(c) ?? { p: 0, r: 0 };
    e.p += Number(r.purchases); e.r += Number(r.revenue_ils); st.set(c, e);
    paidWin += Number(r.revenue_ils);
  }

  const channels: ChannelFunnel[] = [];
  let projectedPaidRevenue = 0;
  let usesPlan = false;

  for (const [c, a] of ad) {
    const s = st.get(c) ?? { p: 0, r: 0 };
    const cpc = a.cl ? a.sp / a.cl : null;
    const cvr = a.cl ? s.p / a.cl : null;
    const aov = s.p ? s.r / s.p : null;
    const roas = a.sp ? s.r / a.sp : null;

    const planned = plan[c] ?? null;
    const spendMtd = spendMtdBy[c] ?? 0;
    // A plan is what's left of it; otherwise carry the trailing daily rate forward.
    const fromPlan = planned != null ? Math.max(0, planned - spendMtd) : null;
    const projectedSpend = fromPlan ?? (a.sp / 7) * daysRemaining;
    if (fromPlan != null) usesPlan = true;

    const projectedRevenue = roas != null ? projectedSpend * roas : 0;
    projectedPaidRevenue += projectedRevenue;
    channels.push({
      channel: c, spendMtd, clicks: a.cl, cpc, orders: s.p, cvr, aov, storeRoas: roas,
      plannedSpend: planned, projectedSpend, projectedRevenue,
      spendSource: fromPlan != null ? "plan" : "run-rate",
    });
  }

  // Everything the ad platforms didn't bring — organic, CRM, direct. Only a run rate is available.
  const nonPaidPerDay = Math.max(0, siteWin - paidWin) / 7;

  // Is the window representative? Compare it to the median day of the preceding four weeks; a
  // median ignores the spike itself rather than being dragged by it.
  const baseFrom = shiftDate(win7, -28);
  const { data: baseRows } = await sb.from("daily_metrics").select("date,revenue_ils")
    .eq("brand_id", brandId).eq("channel", "site").gte("date", baseFrom).lt("date", win7);
  let anomaly: StructuralForecast["anomaly"] = null;
  const baseVals = (baseRows ?? []).map((r) => Number(r.revenue_ils)).sort((a, b) => a - b);
  if (baseVals.length >= 10) {
    const median = baseVals[Math.floor(baseVals.length / 2)];
    const windowDaily = siteWin / 7;
    if (median > 0) {
      const ratio = windowDaily / median;
      if (ratio >= 2 || ratio <= 0.5) anomaly = { ratio, windowDaily, baselineDaily: median };
    }
  }

  return {
    month, elapsedComplete, daysInMonth, daysRemaining,
    channels: channels.sort((a, b) => b.spendMtd - a.spendMtd),
    nonPaidPerDay,
    mtdStoreRevenue,
    projectedStoreRevenue: mtdStoreRevenue + projectedPaidRevenue + nonPaidPerDay * daysRemaining,
    projectedPaidRevenue,
    storeAov: mtdOrders ? mtdStoreRevenue / mtdOrders : null,
    usesPlan,
    anomaly,
  };
}
