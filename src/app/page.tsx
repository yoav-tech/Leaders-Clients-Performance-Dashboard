import { BRANDS, getBrand } from "@/lib/brands";
import { getBrandMetrics, getDailyBreakdown, getLastUpdated } from "@/lib/queries";
import { fetchQuickShopAnalytics, type StoreAnalytics } from "@/lib/storeAnalytics";
import { resolveRange, shiftDate, today } from "@/lib/dates";
import { hasDb } from "@/lib/db";
import AgencyStrip from "@/components/AgencyStrip";
import BrandCard from "@/components/BrandCard";
import BrandCardInteractive from "@/components/BrandCardInteractive";
import DateRangePicker from "@/components/DateRangePicker";
import LeadersLogo from "@/components/LeadersLogo";
import LogoutButton from "@/components/LogoutButton";
import { MagicBentoGrid } from "@/components/magicbento/MagicBento";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp);

  // The drill-down modal always shows the last 7 days, independent of the top selector.
  const last7From = shiftDate(today(), -6);
  const [metrics, lastUpdated, storeEntries, breakdown] = await Promise.all([
    getBrandMetrics(range.from, range.to),
    getLastUpdated(),
    Promise.all(
      BRANDS.map(async (b) => [b.id, await fetchQuickShopAnalytics(b)] as const),
    ),
    getDailyBreakdown(last7From, today()),
  ]);
  const storeAnalytics: Record<string, StoreAnalytics | null> = Object.fromEntries(storeEntries);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LeadersLogo height={34} />
          <div className="border-l border-[var(--card-border)] pl-3">
            <h1 className="text-lg font-bold">Clients Performance</h1>
            <p className="text-xs text-[var(--muted)]">
              {lastUpdated
                ? `Last updated ${new Date(lastUpdated).toLocaleString("he-IL")}`
                : "No data yet — run the ingestion job to populate."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker activeKey={range.key} from={range.from} to={range.to} />
          <LogoutButton />
        </div>
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

      <MagicBentoGrid className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const brand = getBrand(m.brandId) ?? BRANDS[0];
          return (
            <BrandCardInteractive key={m.brandId} brand={brand} days={breakdown[m.brandId] ?? []}>
              <BrandCard brand={brand} metrics={m} store={storeAnalytics[m.brandId] ?? null} />
            </BrandCardInteractive>
          );
        })}
      </MagicBentoGrid>
    </main>
  );
}
