import type { BrandConfig } from "@/lib/brands";
import { getClientReport } from "@/lib/clientReport";
import { getReportNote } from "@/lib/clientReportStore";
import { formatNumber, formatRoas, roasTone } from "@/lib/metrics";
import { PlatformTable, TopAdsTable } from "./reportTables";
import ReportConclusions from "./ReportConclusions";

// The media-manager view of the client report: the same report data the client sees (per-platform
// performance, top ads, sign-ups, paid ROAS) plus the conclusions editor + "send to client" button.
// Async server component — rendered inside a <Suspense> so BrandView shows first and this streams in.

const TONE: Record<string, string> = { good: "text-[var(--good)]", warn: "text-[var(--warn)]", bad: "text-[var(--bad)]", none: "text-[var(--muted)]" };

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone ? TONE[tone] : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export default async function ClientReportPanels({
  brand,
  from,
  to,
  canEdit,
}: {
  brand: BrandConfig;
  from: string;
  to: string;
  canEdit: boolean;
}) {
  const [report, note] = await Promise.all([
    getClientReport(brand, from, to),
    getReportNote(brand.id, "custom", from, to),
  ]);
  if (!report) return null;

  return (
    <div className="space-y-4 text-right" dir="rtl">
      {/* What the client sees in the top-level KPIs — surfaced here too so the manager reviews the
          same numbers before sending. */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="רואס ממומן" value={formatRoas(report.topLevel.paidRoas)} tone={roasTone(report.topLevel.paidRoas, report.target)} hint="הכנסות ממודעות / הוצאת מדיה" />
        <Stat label="הרשמות לדיוור (מטא)" value={formatNumber(report.registrations)} hint="Complete registration" />
      </div>

      <PlatformTable report={report} />
      <TopAdsTable report={report} />

      <ReportConclusions
        brandId={brand.id}
        from={from}
        to={to}
        periodLabel={report.periodLabel}
        summary={report.summary}
        initialNote={note.note}
        initialStatus={note.status === "sent" ? "sent" : "draft"}
        initialSentAt={note.sentAt}
        canEdit={canEdit}
      />
    </div>
  );
}
