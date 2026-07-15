import { BRANDS, getBrand } from "@/lib/brands";
import { getBrandMetrics, getLastUpdated } from "@/lib/queries";
import { hasDb } from "@/lib/db";
import type { Period } from "@/lib/types";
import AgencyStrip from "@/components/AgencyStrip";
import BrandCard from "@/components/BrandCard";
import PeriodSelector from "@/components/PeriodSelector";

export const dynamic = "force-dynamic";

const VALID: Period[] = ["today", "7d", "30d", "mtd"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: Period = VALID.includes(sp.period as Period)
    ? (sp.period as Period)
    : "30d";

  const [metrics, lastUpdated] = await Promise.all([
    getBrandMetrics(period),
    getLastUpdated(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Leaders — Clients Performance</h1>
          <p className="text-xs text-[var(--muted)]">
            {lastUpdated
              ? `Last updated ${new Date(lastUpdated).toLocaleString("he-IL")}`
              : "No data yet — run the ingestion job to populate."}
          </p>
        </div>
        <PeriodSelector active={period} />
      </header>

      {!hasDb() && (
        <div className="mt-4 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
          Database not configured yet. Set <code>SUPABASE_URL</code> +{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> and run the ingestion job to see live numbers.
        </div>
      )}

      <section className="mt-4">
        <AgencyStrip metrics={metrics} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const brand = getBrand(m.brandId) ?? BRANDS[0];
          return <BrandCard key={m.brandId} brand={brand} metrics={m} />;
        })}
      </section>
    </main>
  );
}
