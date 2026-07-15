import type { BrandConfig } from "@/lib/brands";
import type { BrandMetrics, Channel } from "@/lib/types";
import type { StoreAnalytics } from "@/lib/storeAnalytics";
import { formatIls, formatNumber, formatRoas, roasTone } from "@/lib/metrics";
import Sparkline from "./Sparkline";

const TONE_CLASS: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  google: "Google",
  meta: "Meta",
  tiktok: "TikTok",
  site: "Site",
};

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`text-lg font-semibold ${tone ? TONE_CLASS[tone] : ""}`}>{value}</div>
    </div>
  );
}

export default function BrandCard({
  brand,
  metrics,
  store,
}: {
  brand: BrandConfig;
  metrics: BrandMetrics;
  store?: StoreAnalytics | null;
}) {
  const { total, channels, blendedRoas } = metrics;
  const totalTone = roasTone(total.roas, brand.targetRoas);
  const blendedTone = roasTone(blendedRoas, brand.targetRoas);

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-base font-semibold">{brand.name}</div>
          <div className="text-xs text-[var(--muted)]">{brand.storePlatform}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Blended ROAS</div>
          <div className={`text-xl font-bold ${TONE_CLASS[blendedTone]}`}>
            {formatRoas(blendedRoas)}
          </div>
        </div>
      </div>

      {/* Blended headline KPIs (ad channels combined) */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Kpi label="Spend" value={formatIls(total.spend)} />
        <Kpi label="Revenue" value={formatIls(total.revenue)} />
        <Kpi label="ROAS" value={formatRoas(total.roas)} tone={totalTone} />
        <Kpi label="Purchases" value={formatNumber(total.purchases)} />
        <Kpi label="CPA" value={formatIls(total.cpa)} />
        <Kpi label="AOV" value={formatIls(total.aov)} />
      </div>

      {/* Trend */}
      <div className="mt-3">
        <Sparkline data={metrics.trend} />
      </div>

      {/* Per-channel breakdown */}
      <div className="mt-3 border-t border-[var(--card-border)] pt-3">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-xs">
          <div className="text-[var(--muted)]">Channel</div>
          <div className="text-right text-[var(--muted)]">Spend</div>
          <div className="text-right text-[var(--muted)]">Revenue</div>
          <div className="text-right text-[var(--muted)]">ROAS</div>
          {(["google", "meta", "tiktok", "site"] as Channel[]).map((ch) => {
            const c = channels[ch];
            const tone = ch === "site" ? "none" : roasTone(c.roas, brand.targetRoas);
            return (
              <ChannelRow
                key={ch}
                label={CHANNEL_LABEL[ch]}
                spend={ch === "site" ? "—" : formatIls(c.spend)}
                revenue={formatIls(c.revenue)}
                roas={ch === "site" ? "—" : formatRoas(c.roas)}
                tone={tone}
              />
            );
          })}
        </div>
      </div>

      {store && <StoreInsights store={store} />}
    </div>
  );
}

function pctTone(v: number | null): string {
  if (v === null) return "none";
  return v >= 0 ? "good" : "bad";
}

function formatPct(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${Math.round(v)}%`;
}

// QuickShop store insights (fixed last-30-days snapshot from /analytics).
function StoreInsights({ store }: { store: StoreAnalytics }) {
  return (
    <div className="mt-3 border-t border-[var(--card-border)] pt-3">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        Store · last 30 days
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="AOV" value={formatIls(store.aov)} />
        <Kpi label="New customers" value={formatNumber(store.newCustomers)} />
        <Kpi
          label="Rev vs prev"
          value={formatPct(store.revenueGrowthPct)}
          tone={pctTone(store.revenueGrowthPct)}
        />
      </div>
      {store.topProducts.length > 0 && (
        <div className="mt-2 text-xs">
          <div className="text-[var(--muted)]">Top products</div>
          {store.topProducts.map((p) => (
            <div key={p.name} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--muted)]">{formatIls(p.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  label,
  spend,
  revenue,
  roas,
  tone,
}: {
  label: string;
  spend: string;
  revenue: string;
  roas: string;
  tone: string;
}) {
  return (
    <>
      <div className="py-0.5 font-medium">{label}</div>
      <div className="py-0.5 text-right tabular-nums">{spend}</div>
      <div className="py-0.5 text-right tabular-nums">{revenue}</div>
      <div className={`py-0.5 text-right tabular-nums ${TONE_CLASS[tone]}`}>{roas}</div>
    </>
  );
}
