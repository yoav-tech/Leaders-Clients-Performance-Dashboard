import type { BrandConfig } from "@/lib/brands";
import type { CampBrandMetrics } from "@/lib/campaignMetrics";
import type { ReportNote } from "@/lib/clientReportStore";
import { periodLabel } from "@/lib/clientReport";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";
import ReportConclusions from "./ReportConclusions";

// Client report for a leads/awareness brand (Leaders / Bestie) — the leads-world analogue of the
// ecommerce ClientReportPanels: per-platform spend/leads/CPL, a verbal summary that states its
// period, and the manager's conclusions (editable + sendable to the CEO; read-only for the client).

const CH_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };
const TONE: Record<string, string> = { good: "text-[var(--good)]", warn: "text-[var(--warn)]", bad: "text-[var(--bad)]", none: "text-[var(--muted)]" };
// CPL — lower is better, colored vs the brand's target.
const cplTone = (v: number | null, target: number): string => (v == null || !target ? "none" : v <= target ? "good" : v <= target * 1.3 ? "warn" : "bad");
const cpl = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone ? TONE[tone] : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export default function LeadsReportPanels({
  brand,
  metrics,
  note,
  canEdit,
  from,
  to,
}: {
  brand: BrandConfig;
  metrics: CampBrandMetrics;
  note: ReportNote;
  canEdit: boolean;
  from: string;
  to: string;
}) {
  const target = brand.targetCpl ?? 0;
  const t = metrics.total;
  const chans = metrics.channels.filter((c) => c.channel !== "total");
  const label = periodLabel(from, to);
  const best = [...chans].filter((c) => c.leads > 0).sort((a, b) => b.leads - a.leads)[0];
  const summary =
    `סיכום לתקופה ${label}: הוצאה ${formatIls(t.spend)}, ${formatNumber(t.leads)} לידים, עלות לליד ${cpl(t.cpl)}${target ? ` (יעד ₪${target})` : ""}. ` +
    (best ? `הפלטפורמה המובילה בלידים: ${CH_LABEL[best.channel] ?? best.channel} (${formatNumber(best.leads)} לידים).` : "אין לידים בתקופה זו.");

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="הוצאה" value={formatIls(t.spend)} />
        <Stat label="לידים" value={formatNumber(t.leads)} />
        <Stat label="עלות לליד" value={cpl(t.cpl)} tone={cplTone(t.cpl, target)} hint={target ? `יעד ₪${target}` : undefined} />
        <Stat label="קליקים · CTR" value={`${formatNumber(t.clicks)} · ${formatPct(t.ctr)}`} />
      </div>

      <div className="panel p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">ביצועים לפי פלטפורמה</div>
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
      </div>

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
