import { Suspense } from "react";
import { getBrand, type BrandConfig } from "@/lib/brands";
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
import { resolveRange, today, type RangeKey } from "@/lib/dates";
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
import ViewSkeleton from "@/components/ViewSkeleton";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

interface Range { key: RangeKey; from: string; to: string }

// The heavy, per-brand report — rendered inside a Suspense boundary so the shell shows instantly
// and only this streams in. SSR-heavy brands (conversion/app/media-plan) get a skeleton on switch;
// client-fetch brands (awareness/snapshot/perf) return immediately and spin internally.
async function BrandContent({ brand, range, isClient }: { brand: BrandConfig; range: Range; isClient: boolean }) {
  const brandId = brand.id;
  const isMediaPlan = !!brand.mediaPlan;
  const isAppInstall = !!brand.appInstall;
  const isAwareness = !!brand.awarenessSources;
  const isSnapshot = !!brand.googleSnapshot;
  const isPerf = !!brand.perfSources;

  if (isMediaPlan) {
    const exec = await getMediaPlanExecution(brand);
    return (
      <div className="space-y-4">
        {exec ? <MediaPlanView brand={brand} exec={exec} summaryOnly={!!brand.awarenessSources?.length} /> : <div className="panel p-4 text-sm text-[var(--muted)]">No plan data.</div>}
        {/* Same full awareness tables as the other views clients, below the plan layout. */}
        {brand.awarenessSources?.length ? (
          <AwarenessView brandId={brandId} brandName={brand.name} campaignFilter={brand.campaignFilter ?? ""} from={range.from} to={range.to} />
        ) : null}
      </div>
    );
  }
  if (isAppInstall) {
    const appReport = await getAppReport(brand, range.from, range.to);
    return appReport ? <AppReportView brand={brand} report={appReport} from={range.from} to={range.to} /> : <div className="panel p-4 text-sm text-[var(--muted)]">No app data for this range.</div>;
  }
  if (isAwareness) return <AwarenessView brandId={brandId} brandName={brand.name} campaignFilter={brand.campaignFilter ?? ""} from={range.from} to={range.to} />;
  if (isSnapshot) return <SearchSnapshotView brandId={brandId} brandName={brand.name} from={range.from} to={range.to} />;
  if (isPerf) return <CampaignPerfView brandId={brandId} brandName={brand.name} campaignFilter={brand.campaignFilter ?? ""} from={range.from} to={range.to} />;

  // Conversion brand.
  const [allMetrics, monthSpend, breakdownMap, sourceMap, forecast, store] = await Promise.all([
    getBrandMetrics(range.from, range.to),
    getBrandMonthSpend(brandId),
    getDailyBreakdown(range.from, range.to),
    getDailySourceBreakdown(range.from, range.to),
    getMonthForecast(brandId),
    fetchQuickShopAnalytics(brand),
  ]);
  const metrics = allMetrics.find((m) => m.brandId === brandId)!;
  const emptySource: SourceDaily = { sources: [], rows: {} };
  return isClient ? (
    <ClientSummaryView brand={brand} metrics={metrics} breakdown={breakdownMap[brandId] ?? []} forecast={forecast} monthSpend={monthSpend} />
  ) : (
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
      isClient={isClient}
    />
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; range?: string; from?: string; to?: string; as?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp);

  const session = await getServerSession();
  const allowed = allowedBrands(session);
  if (!session || allowed.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="panel p-6 text-sm text-[var(--muted)]">לא הוקצו מותגים לחשבון שלך. פנה ל-Leaders.</div>
      </main>
    );
  }
  const brandId = allowed.some((b) => b.id === sp.brand) ? sp.brand! : allowed[0].id;
  const brand = getBrand(brandId)!;
  const isSpecial = !!(brand.mediaPlan || brand.appInstall || brand.awarenessSources || brand.googleSnapshot || brand.perfSources);

  const isAdmin = session.role === "admin";
  // Admin can preview the client-side interface via ?as=client (trimmed depth + client shell).
  const previewClient = isAdmin && sp.as === "client";
  const isClient = session.role === "client" || previewClient;

  const me = isAdmin ? null : await getUserById(session.sub);
  const accountLabel = previewClient ? "תצוגת לקוח" : isAdmin ? "מנהל מדיה" : me?.fullName || me?.username || "לקוח";
  const accountSub = previewClient ? "Preview" : isAdmin ? "Admin" : me?.username ?? "";
  const lastUpdated = await getLastUpdated();
  const rangeParam = range.key === "custom" ? `&range=custom&from=${range.from}&to=${range.to}` : `&range=${range.key}`;
  const rangeQuery = rangeParam + (previewClient ? "&as=client" : ""); // keep preview across brand switches

  const topBar = (
    <>
      <div className="pr-10 lg:pr-0">
        <h1 className="text-base font-bold">{brand.name}</h1>
        <p className="text-[11px] text-[var(--muted)]">
          {lastUpdated ? `עודכן ${new Date(lastUpdated).toLocaleString("he-IL")}` : "אין נתונים עדיין"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && !previewClient && (
          <a
            href={`/?brand=${brandId}${rangeParam}&as=client`}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)]"
            title="ראה את הדשבורד כפי שהלקוח רואה אותו"
          >
            צפה כלקוח
          </a>
        )}
        {isSpecial ? (
          <LiveRefresher brand={brandId} active />
        ) : (
          <LiveRefresher brand={brandId} active={range.to >= today()} warmPath="/api/live-warm" />
        )}
        <DateRangeCalendar activeKey={range.key} from={range.from} to={range.to} brand={brandId} />
      </div>
    </>
  );

  return (
    <AppShell
      allowed={allowed}
      activeBrand={brandId}
      activeSection="brands"
      isAdmin={isAdmin && !previewClient}
      rangeQuery={rangeQuery}
      accountLabel={accountLabel}
      accountSub={accountSub}
      topBar={topBar}
    >
      {previewClient && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm">
          <span className="text-[var(--foreground)]">מצב תצוגה · כך הלקוח רואה את הדשבורד (ללא ניהול, CAC וקודי הנחה).</span>
          <a href={`/?brand=${brandId}${rangeParam}`} className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 font-medium text-[var(--foreground)] hover:border-[var(--muted)]">
            חזור לתצוגת אדמין
          </a>
        </div>
      )}
      {!hasDb() && (
        <div className="mb-4 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
          Database not configured yet.
        </div>
      )}
      <Suspense key={`${brandId}:${range.from}:${range.to}:${isClient ? "c" : "a"}`} fallback={<ViewSkeleton />}>
        <BrandContent brand={brand} range={range} isClient={isClient} />
      </Suspense>
    </AppShell>
  );
}
