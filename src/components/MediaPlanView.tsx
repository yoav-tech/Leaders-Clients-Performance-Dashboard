import type { BrandConfig } from "@/lib/brands";
import type { MediaPlanExecution, PlatformExecution } from "@/lib/mediaPlan";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};

// Delivery pace vs time elapsed: ahead/on-track (good), slightly behind (warn), behind (bad).
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

type Fmt = "ils" | "num";
const fmt = (v: number | null, f: Fmt) => (v === null ? "—" : f === "ils" ? formatIls(v) : formatNumber(v));

function Row({ label, plan, actual, f, timePct }: { label: string; plan: number | null; actual: number | null; f: Fmt; timePct: number }) {
  const delivered = plan && actual !== null ? actual / plan : null;
  return (
    <tr className="border-t border-[var(--card-border)] tabular-nums">
      <td className="px-2 py-1.5 text-left font-medium">{label}</td>
      <td className="px-2 py-1.5 text-right text-[var(--muted)]">{fmt(plan, f)}</td>
      <td className="px-2 py-1.5 text-right font-semibold">{fmt(actual, f)}</td>
      <td className={`px-2 py-1.5 text-right ${TONE[paceTone(delivered, timePct)]}`}>{delivered === null ? "—" : formatPct(delivered)}</td>
    </tr>
  );
}

function PlatformCard({ p, timePct }: { p: PlatformExecution; timePct: number }) {
  const label = p.platform === "meta" ? "Meta" : "TikTok";
  const cpvPlan = p.plan.thruplay ? p.plan.budget / p.plan.thruplay : null;
  const cpvActual = p.actual.thruplay ? p.actual.spend / p.actual.thruplay : null;
  const budgetPct = p.plan.budget ? p.actual.spend / p.plan.budget : null;
  return (
    <Panel title={`${label} · plan vs execution`}>
      <div className="mb-2 text-sm">
        Spend <span className="font-semibold">{formatIls(p.actual.spend)}</span> of {formatIls(p.plan.budget)}{" "}
        <span className={TONE[paceTone(budgetPct, timePct)]}>({budgetPct === null ? "—" : formatPct(budgetPct)} of budget · time {formatPct(timePct)})</span>
      </div>
      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
        <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (budgetPct ?? 0) * 100)}%` }} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-left">Metric</th>
              <th className="px-2 py-1.5 text-right">Plan</th>
              <th className="px-2 py-1.5 text-right">Actual</th>
              <th className="px-2 py-1.5 text-right">Delivered</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Budget / Spend" plan={p.plan.budget} actual={p.actual.spend} f="ils" timePct={timePct} />
            <Row label="Views" plan={p.plan.views} actual={p.actual.views || null} f="num" timePct={timePct} />
            <Row label="Thruplay" plan={p.plan.thruplay} actual={p.actual.thruplay} f="num" timePct={timePct} />
            <Row label="Impressions" plan={p.plan.impressions ?? null} actual={p.actual.impressions} f="num" timePct={timePct} />
            <Row label="Reach" plan={p.plan.reach ?? null} actual={p.actual.reach} f="num" timePct={timePct} />
            <tr className="border-t border-[var(--card-border)] tabular-nums">
              <td className="px-2 py-1.5 text-left font-medium">CPV (₪/thruplay)</td>
              <td className="px-2 py-1.5 text-right text-[var(--muted)]">{cpvPlan === null ? "—" : `₪${cpvPlan.toFixed(2)}`}</td>
              <td className={`px-2 py-1.5 text-right font-semibold ${cpvActual !== null && cpvPlan !== null ? TONE[cpvActual <= cpvPlan ? "good" : "bad"] : ""}`}>{cpvActual === null ? "—" : `₪${cpvActual.toFixed(2)}`}</td>
              <td className="px-2 py-1.5 text-right text-[var(--muted)]">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function MediaPlanView({ brand, exec }: { brand: BrandConfig; exec: MediaPlanExecution }) {
  const timePct = exec.totalDays ? exec.elapsedDays / exec.totalDays : 0;
  const totalBudget = exec.platforms.reduce((s, p) => s + p.plan.budget, 0);
  const totalSpend = exec.platforms.reduce((s, p) => s + p.actual.spend, 0);
  const spendPct = totalBudget ? totalSpend / totalBudget : 0;

  return (
    <div className="space-y-4">
      <Panel title={`${brand.name} · media plan · ${exec.flightStart} → ${exec.flightEnd}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Flight</div>
            <div className="text-lg font-bold">Day {exec.elapsedDays}/{exec.totalDays}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Total budget</div>
            <div className="text-lg font-bold">{formatIls(totalBudget)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Spent</div>
            <div className="text-lg font-bold">{formatIls(totalSpend)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Spend vs time</div>
            <div className={`text-lg font-bold ${TONE[paceTone(spendPct, timePct)]}`}>{formatPct(spendPct)} / {formatPct(timePct)}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          Awareness campaign (no store/ROAS). Actuals live from Windsor · as of {exec.asOf}. Meta Views not exposed cleanly by the API — Thruplay is the reliable video KPI. TikTok Views = 2-second plays.
        </div>
      </Panel>

      {exec.platforms.map((p) => (
        <PlatformCard key={p.platform} p={p} timePct={timePct} />
      ))}
    </div>
  );
}
