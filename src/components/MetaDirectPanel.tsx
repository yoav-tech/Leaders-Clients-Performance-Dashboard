import { getMetaDirectInsights } from "@/lib/metaDirect";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

// Live panel fed straight from the Meta Marketing API (ads_read). Renders nothing when the token
// can't read the account (unassigned) so it never breaks a page. Also the reviewable surface for
// Meta App Review — the numbers here are pulled via ads_read at request time.
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export default async function MetaDirectPanel({ accountId, from, to }: { accountId: string; from: string; to: string }) {
  const d = await getMetaDirectInsights(accountId, from, to);
  if (!d) return null;
  const roas = d.spend ? d.purchaseValue / d.spend : null;
  return (
    <div className="panel p-4" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Meta · Marketing API · חי</div>
        <div className="text-[11px] text-[var(--muted)]" dir="ltr">read-only · ads_read · act_{accountId}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="הוצאה" value={formatIls(d.spend)} />
        <Stat label="חשיפות" value={formatNumber(d.impressions)} />
        <Stat label="Reach" value={formatNumber(d.reach)} sub={d.frequency != null ? `תדירות ${d.frequency.toFixed(2)}` : undefined} />
        <Stat label="קליקים" value={formatNumber(d.clicks)} sub={d.ctr != null ? `CTR ${formatPct(d.ctr)}` : undefined} />
        <Stat label="רכישות" value={formatNumber(d.purchases)} sub={d.purchaseValue ? `${formatIls(d.purchaseValue)}${roas != null ? ` · ROAS ${roas.toFixed(1)}` : ""}` : undefined} />
        <Stat label="שיחות WhatsApp/הודעות" value={formatNumber(d.messaging)} sub={d.leads ? `${formatNumber(d.leads)} לידים` : undefined} />
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">
        נמשך ישירות מ-Meta Marketing API (הרשאת <span dir="ltr">ads_read</span>, קריאה בלבד) בזמן טעינת העמוד · {from} → {to}
      </div>
    </div>
  );
}
