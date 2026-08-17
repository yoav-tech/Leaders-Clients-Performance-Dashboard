import type { BrandConfig } from "@/lib/brands";
import type { CampBrandMetrics } from "@/lib/campaignMetrics";
import type { ReportNote } from "@/lib/clientReportStore";
import { periodLabel } from "@/lib/clientReport";
import { monthProgress } from "@/lib/dates";
import { computePacing, deltaPct, deltaTone, formatDelta, formatIls, formatNumber, formatPct } from "@/lib/metrics";
import CampaignTrend from "./CampaignTrend";
import ReportConclusions from "./ReportConclusions";

// Leaders / Bestie client view — the leads-world analogue of the ecommerce ClientSummaryView, so
// data + report live in ONE place with the same structure as Argania: top-level KPIs, trend, leads
// by platform, budget pacing, a per-platform table, and the verbal summary + manager conclusions.
// Ecommerce-only metrics (revenue / ROAS / AOV / CVR / store) are omitted — leads brands don't have them.

const TONE: Record<string, string> = { good: "text-[var(--good)]", warn: "text-[var(--warn)]", bad: "text-[var(--bad)]", none: "text-[var(--muted)]" };
const CH_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };
const CH_COLOR: Record<string, string> = { meta: "#0866FF", google: "#4285F4", tiktok: "#69C9D0" };
const cplTone = (v: number | null, target: number): string => (v == null || !target ? "none" : v <= target ? "good" : v <= target * 1.3 ? "warn" : "bad");
const cpl = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      {title && <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>}
      {children}
    </div>
  );
}
function BigKpi({ label, value, metric, cur, prev, tone }: { label: string; value: string; metric?: string; cur?: number | null; prev?: number | null; tone?: string }) {
  const delta = metric && cur !== undefined ? deltaPct(cur ?? null, prev ?? null) : null;
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${tone ? TONE[tone] : ""}`}>{value}</span>
        {delta !== null && metric && <span className={`text-xs font-medium ${TONE[deltaTone(metric, delta)]}`}>{formatDelta(delta)}</span>}
      </div>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tone ? TONE[tone] : ""}`}>{value}</div>
    </div>
  );
}

export default function LeadsClientView({
  brand,
  metrics,
  monthSpend,
  note,
  canEdit,
  from,
  to,
}: {
  brand: BrandConfig;
  metrics: CampBrandMetrics;
  monthSpend: number;
  note: ReportNote;
  canEdit: boolean;
  from: string;
  to: string;
}) {
  const target = brand.targetCpl ?? 0;
  const t = metrics.total;
  const p = metrics.previous;
  const chans = metrics.channels.filter((c) => c.channel !== "total");
  const label = periodLabel(from, to);

  const totalLeads = chans.reduce((s, c) => s + c.leads, 0);
  const split = chans.filter((c) => c.leads > 0).sort((a, b) => b.leads - a.leads);
  const best = split[0];
  const summary =
    `סיכום לתקופה ${label}: הוצאה ${formatIls(t.spend)}, ${formatNumber(t.leads)} לידים, עלות לליד ${cpl(t.cpl)}${target ? ` (יעד ₪${target})` : ""}. ` +
    (best ? `הפלטפורמה המובילה בלידים: ${CH_LABEL[best.channel] ?? best.channel} (${formatNumber(best.leads)} לידים).` : "אין לידים בתקופה זו.");

  const { elapsed, daysInMonth } = monthProgress();
  const pacing = brand.monthlyBudget > 0 ? computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth) : null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <BigKpi label="הוצאה" value={formatIls(t.spend)} metric="spend" cur={t.spend} prev={p.spend} />
        <BigKpi label="לידים" value={formatNumber(t.leads)} metric="leads" cur={t.leads} prev={p.leads} />
        <BigKpi label="עלות לליד (CPL)" value={cpl(t.cpl)} metric="cpl" cur={t.cpl} prev={p.cpl} tone={cplTone(t.cpl, target)} />
        <BigKpi label="קליקים" value={formatNumber(t.clicks)} metric="clicks" cur={t.clicks} prev={p.clicks} />
        <BigKpi label="CTR" value={formatPct(t.ctr)} />
        <BigKpi label="חשיפות" value={formatNumber(t.impressions)} metric="impressions" cur={t.impressions} prev={p.impressions} />
      </div>

      {/* Trend */}
      <Panel>
        <CampaignTrend daily={metrics.daily} profile="leads" />
      </Panel>

      {/* Leads by platform */}
      <Panel title="לידים לפי פלטפורמה">
        <div className="space-y-2.5">
          {split.map((c) => {
            const pct = totalLeads ? (c.leads / totalLeads) * 100 : 0;
            return (
              <div key={c.channel}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span dir="ltr">{CH_LABEL[c.channel] ?? c.channel}</span>
                  <span className="text-[var(--muted)]">{formatNumber(c.leads)} לידים · {Math.round(pct)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CH_COLOR[c.channel] ?? "#8b5cf6" }} />
                </div>
              </div>
            );
          })}
          {split.length === 0 && <div className="text-sm text-[var(--muted)]">אין לידים בטווח זה.</div>}
        </div>
      </Panel>

      {/* Budget pacing */}
      {pacing && (() => {
        const remaining = Math.max(0, pacing.budget - pacing.spend);
        const onTrack = pacing.projected <= pacing.budget * 1.05;
        return (
          <Panel title="תקציב · החודש">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="תקציב חודשי" value={formatIls(pacing.budget)} />
              <Stat label="נוצל" value={formatIls(pacing.spend)} />
              <Stat label="נותר" value={formatIls(remaining)} />
              <Stat label="צפי לסוף חודש" value={formatIls(pacing.projected)} tone={onTrack ? "good" : "warn"} />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
              <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (pacing.spend / (pacing.budget || 1)) * 100)}%` }} />
            </div>
          </Panel>
        );
      })()}

      {/* Per-platform table */}
      <Panel title="ביצועים לפי פלטפורמה">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-right">פלטפורמה</th>
                <th className="px-2 py-1.5 text-left">הוצאה</th><th className="px-2 py-1.5 text-left">חשיפות</th><th className="px-2 py-1.5 text-left">קליקים</th>
                <th className="px-2 py-1.5 text-left">CTR</th><th className="px-2 py-1.5 text-left">לידים</th><th className="px-2 py-1.5 text-left">CPL</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {chans.map((c) => (
                <tr key={c.channel} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 text-right font-medium" dir="ltr">{CH_LABEL[c.channel] ?? c.channel}</td>
                  <td className="px-2 py-1.5 text-left">{formatIls(c.spend)}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(c.impressions)}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(c.clicks)}</td>
                  <td className="px-2 py-1.5 text-left">{formatPct(c.ctr)}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(c.leads)}</td>
                  <td className={`px-2 py-1.5 text-left ${TONE[cplTone(c.cpl, target)]}`}>{cpl(c.cpl)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                <td className="px-2 py-1.5 text-right">סה״כ</td>
                <td className="px-2 py-1.5 text-left">{formatIls(t.spend)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(t.impressions)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(t.clicks)}</td>
                <td className="px-2 py-1.5 text-left">{formatPct(t.ctr)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(t.leads)}</td>
                <td className={`px-2 py-1.5 text-left ${TONE[cplTone(t.cpl, target)]}`}>{cpl(t.cpl)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Verbal summary + manager conclusions */}
      <ReportConclusions
        brandId={brand.id}
        from={from}
        to={to}
        periodLabel={label}
        summary={summary}
        initialNote={note.note}
        initialStatus={note.status === "sent" ? "sent" : "draft"}
        initialSentAt={note.sentAt}
        canEdit={canEdit}
      />
    </div>
  );
}
