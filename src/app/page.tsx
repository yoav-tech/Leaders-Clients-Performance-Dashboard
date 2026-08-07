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
import MediaPlanView from "@/components/MediaPlanView";
import { getMediaPlanExecution } from "@/lib/mediaPlan";
import AppReportView from "@/components/AppReportView";
import { getAppReport } from "@/lib/appReport";
import AwarenessView from "@/components/AwarenessView";
import SearchSnapshotView from "@/components/SearchSnapshotView";
import CampaignPerfView from "@/components/CampaignPerfView";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import PasswordChanger from "@/components/PasswordChanger";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp);

  // Per-client scoping: a client sees only its brands; admin (team) sees all.
  const session = await getServerSession();
  const allowed = allowedBrands(session);
  const isClient = session?.role === "client";
  if (allowed.length === 0) {
    return (
      <main className="dash-aura mx-auto max-w-7xl px-4 py-6">
        <div className="panel p-6 text-sm text-[var(--muted)]">No brands are assigned to your account. Contact Leaders.</div>
      </main>
    );
  }
  const brandId = allowed.some((b) => b.id === sp.brand) ? sp.brand! : allowed[0].id;
  const brand = getBrand(brandId)!;

  const isMediaPlan = !!brand.mediaPlan;
  const isAppInstall = !!brand.appInstall;
  const isAwareness = !!brand.awarenessSources;
  const isSnapshot = !!brand.googleSnapshot;
  const isPerf = !!brand.perfSources;
  const isSpecial = isMediaPlan || isAppInstall || isAwareness || isSnapshot || isPerf;
  const exec = isMediaPlan ? await getMediaPlanExecution(brand) : null;
  const appReport = isAppInstall ? await getAppReport(brand, range.from, range.to) : null;
  const conv = isSpecial
    ? null
    : await (async () => {
        const [allMetrics, monthSpend, breakdownMap, sourceMap, forecast, store] = await Promise.all([
          getBrandMetrics(range.from, range.to),
          getBrandMonthSpend(brandId),
          getDailyBreakdown(range.from, range.to),
          getDailySourceBreakdown(range.from, range.to),
          getMonthForecast(brandId),
          fetchQuickShopAnalytics(brand),
        ]);
        return { metrics: allMetrics.find((m) => m.brandId === brandId)!, monthSpend, breakdownMap, sourceMap, forecast, store };
      })();
  const lastUpdated = await getLastUpdated();
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
          {isSpecial ? (
            <LiveRefresher brand={brandId} active />
          ) : (
            <LiveRefresher brand={brandId} active={range.to >= today()} warmPath="/api/live-warm" />
          )}
          {!isMediaPlan && (
            <DateRangePicker activeKey={range.key} from={range.from} to={range.to} brand={brandId} />
          )}
          {isClient && <PasswordChanger />}
          {session?.role === "admin" && (
            <a href="/admin" className="rounded-md border border-[var(--card-border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">ניהול</a>
          )}
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {allowed.length > 1 && (
        <div className="mt-4">
          <BrandTabs brands={allowed} active={brandId} rangeQuery={rangeQuery} />
        </div>
      )}

      {!hasDb() && (
        <div className="mt-4 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
          Database not configured yet.
        </div>
      )}

      <div className="mt-4">
        {isMediaPlan && exec ? (
          <MediaPlanView brand={brand} exec={exec} />
        ) : isAppInstall ? (
          appReport ? (
            <AppReportView brand={brand} report={appReport} from={range.from} to={range.to} />
          ) : (
            <div className="panel p-4 text-sm text-[var(--muted)]">No app data for this range.</div>
          )
        ) : isAwareness ? (
          <AwarenessView brandId={brandId} brandName={brand.name} campaignFilter={brand.campaignFilter ?? ""} from={range.from} to={range.to} />
        ) : isSnapshot ? (
          <SearchSnapshotView brandId={brandId} brandName={brand.name} from={range.from} to={range.to} />
        ) : isPerf ? (
          <CampaignPerfView brandId={brandId} brandName={brand.name} campaignFilter={brand.campaignFilter ?? ""} from={range.from} to={range.to} />
        ) : conv ? (
          <BrandView
            brand={brand}
            metrics={conv.metrics}
            breakdown={conv.breakdownMap[brandId] ?? []}
            sourceDaily={conv.sourceMap[brandId] ?? emptySource}
            forecast={conv.forecast}
            store={conv.store}
            monthSpend={conv.monthSpend}
            from={range.from}
            to={range.to}
            isClient={isClient}
          />
        ) : null}
      </div>
    </main>
  );
}
