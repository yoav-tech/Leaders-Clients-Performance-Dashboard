import type { BrandConfig } from "@/lib/brands";
import type { BrandMetrics, Channel, DayBreakdown } from "@/lib/types";
import type { MonthForecast } from "@/lib/queries";
import { monthProgress } from "@/lib/dates";
import { computePacing, deltaPct, deltaTone, formatDelta, formatIls, formatNumber, formatPct, formatRoas, roasTone } from "@/lib/metrics";
import TrendChart from "./TrendChart";

// Executive summary for external clients — the outcomes that matter, no technical drill-down
// (no per-channel CTR/CPC/CPM tables, no breakdown explorer, no daily table, no CAC/CPA).

const TONE: Record<string, string> = { good: "text-[var(--good)]", warn: "text-[var(--warn)]", bad: "text-[var(--bad)]", none: "text-[var(--muted)]" };

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
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${tone ? TONE[tone] : ""}`}>{value}</span>
        {delta !== null && metric && <span className={`text-xs font-medium ${TONE[deltaTone(metric, delta)]}`}>{formatDelta(delta)}</span>}
      </div>
    </div>
  );
}

const CH_LABEL: Record<string, string> = { google: "Google", meta: "Meta", tiktok: "TikTok", organic: "אורגני / ישיר" };
const CH_COLOR: Record<string, string> = { google: "#4285F4", meta: "#0866FF", tiktok: "#69C9D0", organic: "#8b5cf6" };

export default function ClientSummaryView({
  brand,
  metrics,
  breakdown,
  forecast,
  monthSpend,
}: {
  brand: BrandConfig;
  metrics: BrandMetrics;
  breakdown: DayBreakdown[];
  forecast: MonthForecast;
  monthSpend: number;
}) {
  const { total, channels, blendedRoas, newRevenue, returningRevenue, previous: p } = metrics;
  const target = brand.targetRoas;

  const storeRev = channels.site.revenue;
  const orders = channels.site.purchases;
  const storeAov = orders ? storeRev / orders : null;
  const storeCvr = total.clicks ? orders / total.clicks : null;
  const prevAov = p && p.siteOrders ? p.siteRevenue / p.siteOrders : null;
  const prevCvr = p && p.clicks ? p.siteOrders / p.clicks : null;
  const newPct = storeRev ? (newRevenue / storeRev) * 100 : 0;

  // Revenue by channel (store-attributed) + organic/direct remainder.
  const chRev = (ch: Channel) => channels[ch].revenue;
  const paid = chRev("google") + chRev("meta") + chRev("tiktok");
  const organic = Math.max(0, storeRev - paid);
  const split = [
    { key: "google", v: chRev("google") },
    { key: "meta", v: chRev("meta") },
    { key: "tiktok", v: chRev("tiktok") },
    { key: "organic", v: organic },
  ].filter((r) => r.v > 0).sort((a, b) => b.v - a.v);

  const { elapsed, daysInMonth } = monthProgress();
  const pacing = brand.monthlyBudget > 0 ? computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth) : null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Headline outcomes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigKpi label="הכנסות חנות" value={formatIls(storeRev)} metric="siteRevenue" cur={storeRev} prev={p?.siteRevenue ?? null} />
        <BigKpi label="הזמנות" value={formatNumber(orders)} metric="storeOrders" cur={orders} prev={p?.siteOrders ?? null} />
        <BigKpi label="ROAS" value={formatRoas(blendedRoas)} metric="blendedRoas" cur={blendedRoas} prev={p?.blendedRoas ?? null} tone={roasTone(blendedRoas, target)} />
        <BigKpi label="הוצאה" value={formatIls(total.spend)} metric="spend" cur={total.spend} prev={p?.spend ?? null} />
        <BigKpi label="AOV" value={formatIls(storeAov)} metric="aov" cur={storeAov} prev={prevAov} />
        <BigKpi label="המרה (CVR)" value={formatPct(storeCvr)} metric="storeCvr" cur={storeCvr} prev={prevCvr} />
        <BigKpi label="הכנסות ממודעות" value={formatIls(total.revenue)} metric="revenue" cur={total.revenue} prev={p?.revenue ?? null} />
        <BigKpi label="רכישות (מודעות)" value={formatNumber(total.purchases)} metric="purchases" cur={total.purchases} prev={p?.purchases ?? null} />
      </div>

      {/* Trend */}
      <Panel>
        <TrendChart data={breakdown} isClient defaultMetric="siteRevenue" />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Where revenue comes from */}
        <Panel title="מאיפה מגיעות ההכנסות">
          <div className="space-y-2.5">
            {split.map((r) => {
              const pct = storeRev ? (r.v / storeRev) * 100 : 0;
              return (
                <div key={r.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{CH_LABEL[r.key]}</span>
                    <span className="text-[var(--muted)]">{formatIls(r.v)} · {Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CH_COLOR[r.key] }} />
                  </div>
                </div>
              );
            })}
            {split.length === 0 && <div className="text-sm text-[var(--muted)]">אין נתוני הכנסה לטווח זה.</div>}
          </div>
        </Panel>

        {/* New vs returning */}
        <Panel title="לקוחות חדשים מול חוזרים">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">חדשים ({Math.round(newPct)}%)</div>
              <div className="mt-0.5 text-lg font-bold">{formatIls(newRevenue)}</div>
            </div>
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">חוזרים ({Math.round(100 - newPct)}%)</div>
              <div className="mt-0.5 text-lg font-bold">{formatIls(returningRevenue)}</div>
            </div>
          </div>
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full bg-[var(--good)]" style={{ width: `${newPct}%` }} />
            <div className="h-full bg-blue-600" style={{ width: `${100 - newPct}%` }} />
          </div>
        </Panel>
      </div>

      {/* Budget pacing (high level) */}
      {pacing && (() => {
        const remaining = Math.max(0, pacing.budget - pacing.spend);
        const onTrack = pacing.projected <= pacing.budget * 1.05;
        return (
          <Panel title="תקציב · החודש">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <BigKpi label="תקציב חודשי" value={formatIls(pacing.budget)} />
              <BigKpi label="נוצל" value={formatIls(pacing.spend)} />
              <BigKpi label="נותר" value={formatIls(remaining)} />
              <BigKpi label="צפי לסוף חודש" value={formatIls(pacing.projected)} tone={onTrack ? "good" : "warn"} />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
              <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (pacing.spend / (pacing.budget || 1)) * 100)}%` }} />
            </div>
          </Panel>
        );
      })()}

      {/* Month-end forecast (store outcomes only) */}
      <Panel title={`צפי לסוף החודש · ${forecast.month}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BigKpi label="הכנסות חנות (צפי)" value={formatIls(forecast.eom.storeRevenue)} />
          <BigKpi label="הזמנות (צפי)" value={formatNumber(Math.round(forecast.eom.orders))} />
          <BigKpi label="ROAS (צפי)" value={formatRoas(forecast.eom.blendedRoas)} tone={roasTone(forecast.eom.blendedRoas, target)} />
          <BigKpi label="AOV (צפי)" value={formatIls(forecast.eom.aov)} />
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">מבוסס על קצב 7 הימים האחרונים · {forecast.elapsedComplete}/{forecast.daysInMonth} ימים.</div>
      </Panel>
    </div>
  );
}
