import { BRANDS, getBrand } from "@/lib/brands";
import {
  getBrandMetrics,
  getBrandMonthSpend,
  getDailyBreakdown,
  getDailySourceBreakdown,
  getMonthForecast,
  getLastUpdated,
  type SourceDaily,
} from "@/lib/queries";
import { fetchQuickShopAnalytics } from "@/lib/storeAnalytics";
import { resolveRange, today } from "@/lib/dates";
import { hasDb } from "@/lib/db";
import BrandView from "@/components/BrandView";
import BrandTabs from "@/components/BrandTabs";
import DateRangePicker from "@/components/DateRangePicker";
import LeadersLogo from "@/components/LeadersLogo";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import LiveRefresher from "@/components/LiveRefresher";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const brandId = BRANDS.some((b) => b.id === sp.brand) ? sp.brand! : BRANDS[0].id;
  const brand = getBrand(brandId)!;

  const [allMetrics, monthSpend, breakdownMap, sourceMap, forecast, store, lastUpdated] = await Promise.all([
    getBrandMetrics(range.from, range.to),
    getBrandMonthSpend(brandId),
    getDailyBreakdown(range.from, range.to),
    getDailySourceBreakdown(range.from, range.to),
    getMonthForecast(brandId),
    fetchQuickShopAnalytics(brand),
    getLastUpdated(),
  ]);
  const metrics = allMetrics.find((m) => m.brandId === brandId)!;
  const emptySource: SourceDaily = { sources: [], rows: {} };

  // Preserve the current range across brand-tab navigation.
  const rangeQuery =
    range.key === "custom"
      ? `&range=custom&from=${range.from}&to=${range.to}`
      : `&range=${range.key}`;

  return (
    <main className="dash-aura mx-auto max-w-7xl px-4 py-6">
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
          <LiveRefresher brand={brandId} includesToday={range.to >= today()} />
          <DateRangePicker activeKey={range.key} from={range.from} to={range.to} brand={brandId} />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <div className="mt-4">
        <BrandTabs active={brandId} rangeQuery={rangeQuery} />
      </div>

      {!hasDb() && (
        <div className="mt-4 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
          Database not configured yet.
        </div>
      )}

      <div className="mt-4">
        <BrandView
          brand={brand}
          metrics={metrics}
          breakdown={breakdownMap[brandId] ?? []}
          sourceDaily={sourceMap[brandId] ?? emptySource}
          forecast={forecast}
          store={store}
          monthSpend={monthSpend}
          from={range.from}
          to={range.to}
        />
      </div>
    </main>
  );
}
