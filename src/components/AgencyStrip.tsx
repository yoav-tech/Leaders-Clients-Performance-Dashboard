import type { BrandMetrics } from "@/lib/types";
import { formatIls, formatNumber, formatRoas } from "@/lib/metrics";

// Combined totals across all brands (ILS), shown as the top summary strip.
export default function AgencyStrip({ metrics }: { metrics: BrandMetrics[] }) {
  const spend = sum(metrics, (m) => m.total.spend);
  const revenue = sum(metrics, (m) => m.total.revenue);
  const purchases = sum(metrics, (m) => m.total.purchases);
  const siteRevenue = sum(metrics, (m) => m.channels.site.revenue);
  const roas = spend ? revenue / spend : null;
  const blended = spend ? siteRevenue / spend : null;

  const items = [
    { label: "Total Spend", value: formatIls(spend) },
    { label: "Ad Revenue", value: formatIls(revenue) },
    { label: "Site Revenue", value: formatIls(siteRevenue) },
    { label: "Purchases", value: formatNumber(purchases) },
    { label: "ROAS", value: formatRoas(roas) },
    { label: "Blended ROAS", value: formatRoas(blended) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div key={it.label}>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{it.label}</div>
          <div className="text-xl font-bold">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function sum(metrics: BrandMetrics[], pick: (m: BrandMetrics) => number): number {
  return metrics.reduce((acc, m) => acc + (pick(m) || 0), 0);
}
