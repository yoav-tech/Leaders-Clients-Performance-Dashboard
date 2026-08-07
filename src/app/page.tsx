import { getBrand } from "@/lib/brands";
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
import LiveRefresher from "@/components/LiveRefresher";
import MediaPlanView from "@/components/MediaPlanView";
import { getMediaPlanExecution } from "@/lib/mediaPlan";
import AppReportView from "@/components/AppReportView";
import { getAppReport } from "@/lib/appReport";
import AwarenessView from "@/components/AwarenessView";
import SearchSnapshotView from "@/components/SearchSnapshotView";
import CampaignPerfView from "@/components/CampaignPerfView";
import ClientSummaryView from "@/components/ClientSummaryView";
import AppShell from "@/components/AppShell";
import DateRangeCalendar from "@/components/DateRangeCalendar";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp);

  const session = await getServerSession();
  const allowed = allowedBrands(session);
  const isClient = session?.role === "client";
  if (!session || allowed.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="panel p-6 text-sm text-[var(--muted)]">לא הוקצו מותגים לחשבון שלך. פנה ל-Leaders.</div>
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

  // Preserve the current range across brand navigation.
  const rangeQuery =
    range.key === "custom" ? `&range=custom&from=${range.from}&to=${range.to}` : `&range=${range.key}`;

  // Account chip label.
  const isAdmin = session.role === "admin";
  const me = isAdmin ? null : await getUserById(session.sub);
  const accountLabel = isAdmin ? "מנהל מדיה" : me?.fullName || me?.username || "לקוח";
  const accountSub = isAdmin ? "Admin" : me?.username ?? "";

  const topBar = (
    <>
      <div className="pr-10 lg:pr-0">
        <h1 className="text-base font-bold">{brand.name}</h1>
        <p className="text-[11px] text-[var(--muted)]">
          {lastUpdated ? `עודכן ${new Date(lastUpdated).toLocaleString("he-IL")}` : "אין נתונים עדיין"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isSpecial ? (
          <LiveRefresher brand={brandId} active />
        ) : (
          <LiveRefresher brand={brandId} active={range.to >= today()} warmPath="/api/live-warm" />
        )}
        {!isMediaPlan && <DateRangeCalendar activeKey={range.key} from={range.from} to={range.to} brand={brandId} />}
      </div>
    </>
  );

  return (
    <AppShell
      allowed={allowed}
      activeBrand={brandId}
      activeSection="brands"
      isAdmin={isAdmin}
      rangeQuery={rangeQuery}
      accountLabel={accountLabel}
      accountSub={accountSub}
      topBar={topBar}
    >
      {!hasDb() && (
        <div className="mb-4 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
          Database not configured yet.
        </div>
      )}

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
        isClient ? (
          <ClientSummaryView
            brand={brand}
            metrics={conv.metrics}
            breakdown={conv.breakdownMap[brandId] ?? []}
            forecast={conv.forecast}
            monthSpend={conv.monthSpend}
          />
        ) : (
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
        )
      ) : null}
    </AppShell>
  );
}
