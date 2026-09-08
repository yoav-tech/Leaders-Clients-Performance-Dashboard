import type { AwarenessRangeReport } from "@/lib/awarenessRange";
import { formatIls, formatNumber } from "@/lib/metrics";

// English throughout: this view is shown to the client's global team, so it has to read without
// translation. Deliberately no trend chart and no daily table — the client asked for the campaign
// result, not the day-by-day working.

const cpv = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(3)}`);
const num = (v: number | null) => (v == null ? "—" : formatNumber(v));
const freq = (v: number | null) => (v == null ? "—" : v.toFixed(2));

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export default function AwarenessRangeView({ report, brandName }: { report: AwarenessRangeReport; brandName: string }) {
  const t = report.totals;
  const target = report.planTotals?.planCpv ?? report.targetCpv;
  // Each platform is judged against its own planned CPV — the plan sets a different goal for
  // Facebook than for YouTube, so one blended number would mislabel both.
  const planByKey = new Map(report.plan.map((p) => [p.key, p]));
  const goalFor = (key: string) => planByKey.get(key)?.planCpv ?? target;
  const tone = (v: number | null, goal: number | null) =>
    v == null || goal == null ? "" : v <= goal ? "text-[var(--good)]" : "text-[var(--bad)]";
  const onTarget = target != null && t.cpv != null ? t.cpv <= target : null;
  const hookRate = t.impressions ? t.views3s / t.impressions : null;
  const holdRate = t.views3s ? t.views15s / t.views3s : null;

  return (
    <div className="space-y-4" dir="ltr">
      <div className="text-sm text-[var(--muted)]">
        {brandName} · video campaign results · {report.from} → {report.to}
      </div>

      <div className="panel p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">Campaign results</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Spend" value={formatIls(t.spend)} />
          <Kpi label="Impressions" value={formatNumber(t.impressions)} />
          <Kpi label="3-sec views" value={formatNumber(t.views3s)} sub={hookRate != null ? `${(hookRate * 100).toFixed(1)}% hook rate` : undefined} />
          <Kpi label="15-sec views" value={formatNumber(t.views15s)} sub={holdRate != null ? `${(holdRate * 100).toFixed(0)}% held from 3s` : undefined} />
          <Kpi
            label="Cost per 15-sec view"
            value={cpv(t.cpv)}
            sub={target != null ? `target ${cpv(target)}` : undefined}
            tone={onTarget == null ? "" : onTarget ? "text-[var(--good)]" : "text-[var(--bad)]"}
          />
          <Kpi
            label="Vs target"
            value={onTarget == null ? "—" : onTarget ? "On target" : "Above target"}
            sub={target != null && t.cpv != null ? `${Math.round((t.cpv / target) * 100)}% of target` : undefined}
            tone={onTarget == null ? "" : onTarget ? "text-[var(--good)]" : "text-[var(--bad)]"}
          />
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">By platform</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Platform</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Impressions</th>
                <th className="px-2 py-1.5 text-right">Reach</th>
                <th className="px-2 py-1.5 text-right">Frequency</th>
                <th className="px-2 py-1.5 text-right">3-sec views</th>
                <th className="px-2 py-1.5 text-right">15-sec views</th>
                <th className="px-2 py-1.5 text-right">Cost / view</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.rows.map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 text-left font-medium">{r.label}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right">{num(r.reach)}</td>
                  <td className="px-2 py-1.5 text-right">{freq(r.frequency)}</td>
                  <td className="px-2 py-1.5 text-right">{num(r.views3s)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(r.views15s)}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${tone(r.cpv, goalFor(r.key))}`}>
                    {cpv(r.cpv)}
                    {goalFor(r.key) != null && <span className="ms-1 text-[10px] font-normal text-[var(--muted)]">/ {cpv(goalFor(r.key))}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--card-border)] font-bold tabular-nums">
                <td className="px-2 py-1.5 text-left">Total</td>
                <td className="px-2 py-1.5 text-right">{formatIls(t.spend)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(t.impressions)}</td>
                <td className="px-2 py-1.5 text-right text-[var(--muted)]">—</td>
                <td className="px-2 py-1.5 text-right text-[var(--muted)]">—</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(t.views3s)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(t.views15s)}</td>
                <td className="px-2 py-1.5 text-right">{cpv(t.cpv)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-[var(--muted)]">
          <div>Reach and frequency are measured across the whole period, not summed by day — the same person seen on three days is one person reached.</div>
          {report.reachNote.map((n2) => <div key={n2}>{n2}</div>)}
        </div>
      </div>

      {report.plan.length > 0 && report.planTotals && (
        <div className="panel p-4">
          <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">Media plan vs delivery</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-left">Platform</th>
                  <th className="px-2 py-1.5 text-right">Planned budget</th>
                  <th className="px-2 py-1.5 text-right">Spent</th>
                  <th className="px-2 py-1.5 text-right">% of plan</th>
                  <th className="px-2 py-1.5 text-right">Planned views</th>
                  <th className="px-2 py-1.5 text-right">Delivered</th>
                  <th className="px-2 py-1.5 text-right">% of target</th>
                  <th className="px-2 py-1.5 text-right">Cost / view vs plan</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.plan.map((p) => (
                  <tr key={p.key} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">{p.label}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatIls(p.planBudget)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(p.spend)}</td>
                    <td className="px-2 py-1.5 text-right">{p.budgetPct == null ? "—" : `${Math.round(p.budgetPct)}%`}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatNumber(p.planViews)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(p.views)}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${p.viewsPct == null ? "" : p.viewsPct >= 100 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
                      {p.viewsPct == null ? "—" : `${Math.round(p.viewsPct)}%`}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${p.beat == null ? "" : p.beat ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
                      {cpv(p.cpv)} <span className="text-[10px] text-[var(--muted)]">/ {cpv(p.planCpv)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--card-border)] font-bold tabular-nums">
                  <td className="px-2 py-1.5 text-left">Total</td>
                  <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatIls(report.planTotals.planBudget)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(report.planTotals.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{report.planTotals.budgetPct == null ? "—" : `${Math.round(report.planTotals.budgetPct)}%`}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatNumber(report.planTotals.planViews)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(report.planTotals.views)}</td>
                  <td className={`px-2 py-1.5 text-right ${(report.planTotals.viewsPct ?? 0) >= 100 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
                    {report.planTotals.viewsPct == null ? "—" : `${Math.round(report.planTotals.viewsPct)}%`}
                  </td>
                  <td className={`px-2 py-1.5 text-right ${report.planTotals.beat ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
                    {cpv(report.planTotals.cpv)} <span className="text-[10px] font-normal text-[var(--muted)]">/ {cpv(report.planTotals.planCpv)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-[var(--muted)]">Targets are the signed media plan, phase 1 and scaling combined. Each platform carries its own view target, so its cost-per-view goal differs.</div>
        </div>
      )}

      {report.creatives.length > 0 && (
        <div className="panel p-4">
          <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">Leading creatives</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-left">Creative</th>
                  <th className="px-2 py-1.5 text-left">Platform</th>
                  <th className="px-2 py-1.5 text-right">Spend</th>
                  <th className="px-2 py-1.5 text-right">Impressions</th>
                  <th className="px-2 py-1.5 text-right">15-sec views</th>
                  <th className="px-2 py-1.5 text-right">Cost / view</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.creatives.map((c, i) => (
                  <tr key={`${c.platform}-${c.name}-${i}`} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">
                      {c.previewUrl ? (
                        <a href={c.previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {c.name} ↗
                        </a>
                      ) : c.name}
                    </td>
                    <td className="px-2 py-1.5 text-left text-[var(--muted)]">{c.platform}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(c.spend)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(c.impressions)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(c.views15s)}</td>
                    <td className={`px-2 py-1.5 text-right ${tone(c.cpv, target)}`}>{cpv(c.cpv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-[var(--muted)]">Ranked by 15-second views. Meta creatives link to the live post; TikTok does not expose a public permalink.</div>
        </div>
      )}
    </div>
  );
}
