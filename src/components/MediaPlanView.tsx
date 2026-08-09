import type { BrandConfig } from "@/lib/brands";
import type { MediaPlanExecution, LineExecution } from "@/lib/mediaPlan";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};
const TYPE_LABEL: Record<string, string> = {
  influencers: "משפעניות · Influencers",
  ugc: "UGC",
  reach: "ריץ׳ · Reach",
};

function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
}
function paceTone(deliveredPct: number | null, timePct: number): string {
  if (deliveredPct === null || timePct <= 0) return "none";
  const r = deliveredPct / timePct;
  return r >= 0.95 ? "good" : r >= 0.75 ? "warn" : "bad";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}

function LineRow({ le, asOf }: { le: LineExecution; asOf: string }) {
  const { line, actual, remaining, daysLeft, dailyNeeded } = le;
  const timePct = daysInclusive(line.flightStart, line.flightEnd) > 0 ? daysInclusive(line.flightStart, asOf) / daysInclusive(line.flightStart, line.flightEnd) : 0;
  const budgetPct = line.budget ? actual.spend / line.budget : null;
  // Primary delivery KPI: reach for the reach line, thruplay for video lines.
  const isReach = line.type === "reach";
  const kpiPlan = isReach ? line.reach ?? 0 : line.thruplay;
  const kpiActual = isReach ? actual.reach : actual.thruplay;
  const delivered = kpiPlan ? kpiActual / kpiPlan : null;

  return (
    <tr className="border-t border-[var(--card-border)] tabular-nums">
      <td className="px-2 py-2 text-left">
        <div className="font-medium">{TYPE_LABEL[line.type]}</div>
        <div className="text-[11px] text-[var(--muted)]">{line.platform === "meta" ? "Meta" : "TikTok"}</div>
      </td>
      <td className="px-2 py-2 text-right">{formatIls(line.budget)}</td>
      <td className={`px-2 py-2 text-right ${TONE[paceTone(budgetPct, timePct)]}`}>
        {formatIls(actual.spend)}
        <div className="text-[11px]">{budgetPct === null ? "" : formatPct(budgetPct)}</div>
      </td>
      <td className="px-2 py-2 text-right font-semibold">{formatIls(remaining)}</td>
      <td className="px-2 py-2 text-right font-semibold text-[var(--foreground)]">
        {formatIls(dailyNeeded)}<span className="text-[11px] text-[var(--muted)]">/day</span>
        <div className="text-[11px] text-[var(--muted)]">{daysLeft}d left</div>
      </td>
      <td className={`px-2 py-2 text-right ${TONE[paceTone(delivered, timePct)]}`}>
        {formatNumber(Math.round(kpiActual))} / {formatNumber(kpiPlan)}
        <div className="text-[11px]">{delivered === null ? "—" : formatPct(delivered)} {isReach ? "reach" : "thruplay"}</div>
      </td>
    </tr>
  );
}

export default function MediaPlanView({ brand, exec }: { brand: BrandConfig; exec: MediaPlanExecution }) {
  const timePct = exec.totalDays ? exec.elapsedDays / exec.totalDays : 0;
  const totalBudget = exec.lines.reduce((s, l) => s + l.line.budget, 0);
  const totalSpend = exec.lines.reduce((s, l) => s + l.actual.spend, 0);
  const totalRemaining = exec.lines.reduce((s, l) => s + l.remaining, 0);
  const totalDailyNeeded = exec.lines.reduce((s, l) => s + l.dailyNeeded, 0);
  const spendPct = totalBudget ? totalSpend / totalBudget : 0;

  // Order: influencers, ugc, reach; meta before tiktok.
  const order: Record<string, number> = { influencers: 0, ugc: 1, reach: 2 };
  const lines = [...exec.lines].sort((a, b) => order[a.line.type] - order[b.line.type] || (a.line.platform === "meta" ? -1 : 1));

  return (
    <div className="space-y-4">
      <Panel title={`${brand.name} · media plan · ${exec.flightStart} → ${exec.flightEnd}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Flight</div>
            <div className="text-lg font-bold">Day {exec.elapsedDays}/{exec.totalDays}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Spent / budget</div>
            <div className="text-lg font-bold">{formatIls(totalSpend)} / {formatIls(totalBudget)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Remaining</div>
            <div className="text-lg font-bold">{formatIls(totalRemaining)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Spend vs time</div>
            <div className={`text-lg font-bold ${TONE[paceTone(spendPct, timePct)]}`}>{formatPct(spendPct)} / {formatPct(timePct)}</div>
          </div>
        </div>
      </Panel>

      <Panel title="By campaign type · remaining budget & daily pace">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Campaign</th>
                <th className="px-2 py-1.5 text-right">Budget</th>
                <th className="px-2 py-1.5 text-right">Spent</th>
                <th className="px-2 py-1.5 text-right">Remaining</th>
                <th className="px-2 py-1.5 text-right">Daily needed</th>
                <th className="px-2 py-1.5 text-right">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((le) => (
                <LineRow key={`${le.line.platform}-${le.line.type}`} le={le} asOf={exec.asOf} />
              ))}
              <tr className="border-t-2 border-[var(--card-border)] font-semibold tabular-nums">
                <td className="px-2 py-2 text-left">Total</td>
                <td className="px-2 py-2 text-right">{formatIls(totalBudget)}</td>
                <td className="px-2 py-2 text-right">{formatIls(totalSpend)}</td>
                <td className="px-2 py-2 text-right">{formatIls(totalRemaining)}</td>
                <td className="px-2 py-2 text-right">{formatIls(totalDailyNeeded)}<span className="text-[11px] text-[var(--muted)]">/day</span></td>
                <td className="px-2 py-2 text-right"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          Daily needed = remaining ÷ days left (to hit the plan on pace). Classified by ad-set/ad name (Influencer / UGC / Reach). Actuals live from Windsor · as of {exec.asOf}. Delivery = thruplay (video) or reach.
        </div>
      </Panel>
    </div>
  );
}
