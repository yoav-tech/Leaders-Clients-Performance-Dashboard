import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getBrand, campaignProfileOf, explorerChannels, type BrandConfig } from "@/lib/brands";
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
import SearchSnapshotView from "@/components/SearchSnapshotView";
import CampaignBrandView from "@/components/CampaignBrandView";
import { getCampaignBrandMetrics } from "@/lib/campaignMetrics";
import ClientSummaryView from "@/components/ClientSummaryView";
import ClientReportPanels from "@/components/ClientReportPanels";
import CommandCenterView from "@/components/CommandCenterView";
import { getClientReport } from "@/lib/clientReport";
import { getReportNote } from "@/lib/clientReportStore";
import AppShell from "@/components/AppShell";
import DateRangeCalendar from "@/components/DateRangeCalendar";
import ViewSkeleton from "@/components/ViewSkeleton";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

interface Range { key: RangeKey; from: string; to: string }

// Placeholder while the report panels (Meta ad-level fetch) stream in — keeps the client view
// from looking stuck on a cold cache.
function ReportPanelsSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40" />)}
      </div>
      <div className="h-40 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40" />
      <div className="h-40 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40" />
    </div>
  );
}

// The heavy, per-brand report — rendered inside a Suspense boundary so the shell shows instantly
// and only this streams in. SSR-heavy brands (conversion/app/media-plan) get a skeleton on switch;
// client-fetch brands (awareness/snapshot/perf) return immediately and spin internally.
async function BrandContent({ brand, range, isClient, sub, tab, asParam }: { brand: BrandConfig; range: Range; isClient: boolean; sub: string; tab: string; asParam: string }) {
  const brandId = brand.id;

  // Marketing command center (Leaders): its own view with sub-section tabs (Leaders / Bestie),
  // a native content calendar + approvals, and briefs — instead of the standard brand dashboard.
  if (brand.commandCenter) {
    return <CommandCenterView brand={brand} subId={sub} tab={tab} range={range} asParam={asParam} />;
  }

  const isMediaPlan = !!brand.mediaPlan;
  const isAppInstall = !!brand.appInstall;
  const isSnapshot = !!brand.googleSnapshot;

  // Views/leads clients (SCJ, Style, Leaders, Bestie) — the unified DB-backed layout: overview +
  // budget pacing + channel funnel + trend + breakdown explorer + daily, KPI-adapted per profile.
  const profile = campaignProfileOf(brand);
  if (profile === "views" || profile === "leads") {
    const [cm, monthSpend] = await Promise.all([
      getCampaignBrandMetrics(brand, range.from, range.to),
      getBrandMonthSpend(brandId),
    ]);
    return (
      <CampaignBrandView
        brand={brand}
        metrics={cm}
        monthSpend={monthSpend}
        from={range.from}
        to={range.to}
        channels={explorerChannels(brand).map((c) => ({ id: c.id, label: c.label }))}
      />
    );
  }

  if (isMediaPlan) {
    // Media-plan brands without a campaign profile keep the fixed-flight plan layout.
    const exec = await getMediaPlanExecution(brand);
    return exec ? <MediaPlanView brand={brand} exec={exec} /> : <div className="panel p-4 text-sm text-[var(--muted)]">No plan data.</div>;
  }
  if (isAppInstall) {
    const appReport = await getAppReport(brand, range.from, range.to);
    return appReport ? <AppReportView brand={brand} report={appReport} from={range.from} to={range.to} /> : <div className="panel p-4 text-sm text-[var(--muted)]">No app data for this range.</div>;
  }
  if (isSnapshot) return <SearchSnapshotView brandId={brandId} brandName={brand.name} from={range.from} to={range.to} />;

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

  // Client view (and admin previewing as client): ONE integrated view — the executive summary with
  // paid ROAS + sign-ups in the top-level KPIs, the per-platform + top-ads tables, and the verbal
  // summary (auto text + the manager's conclusions), all for the same period. Read-only.
  if (isClient) {
    const [report, note] = await Promise.all([
      getClientReport(brand, range.from, range.to),
      getReportNote(brandId, "custom", range.from, range.to),
    ]);
    return (
      <ClientSummaryView
        brand={brand}
        metrics={metrics}
        breakdown={breakdownMap[brandId] ?? []}
        forecast={forecast}
        monthSpend={monthSpend}
        report={report}
        note={note}
        canEdit={false}
      />
    );
  }

  // Media-manager view: full drill-down + the report editor (conclusions + "send to client"),
  // streamed in its own Suspense boundary since the Meta ad-level fetch can be slow on a cold cache.
  return (
    <div className="space-y-4">
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
      <Suspense fallback={<ReportPanelsSkeleton />}>
        <ClientReportPanels brand={brand} from={range.from} to={range.to} canEdit />
      </Suspense>
    </div>
  );
}

// Clean per-client route: /<client> (e.g. /argania). The brand id is the path segment; the date
// window + client-preview flag ride the query (?range=… &as=client).
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; as?: string; sub?: string; tab?: string }>;
}) {
  const [{ client }, sp] = await Promise.all([params, searchParams]);
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
  // Unknown / not-allowed client → send to the user's first brand (clean URL, no 404 dead-end).
  if (!allowed.some((b) => b.id === client)) redirect(`/${allowed[0].id}`);
  const brandId = client;
  const brand = getBrand(brandId)!;
  // DB-backed brands (ecommerce + views + leads) are ingested, so warm "today" on load. The
  // still-live brands (Colgate snapshot, Haat app) refresh in place without a warm.
  const liveWarm = !brand.googleSnapshot && !brand.appInstall;

  const isAdmin = session.role === "admin";
  // Admin can preview the client-side interface via ?as=client (trimmed depth + client shell).
  const previewClient = isAdmin && sp.as === "client";
  const isClient = session.role === "client" || previewClient;

  // Look up the identity for every role. The shared "admin" login has no DB row (sub="admin"/"team")
  // → falls back to Gal. A DB admin user (e.g. yoav, the owner) shows their own name/email.
  const me = previewClient ? null : await getUserById(session.sub).catch(() => null);
  const accountLabel = previewClient ? "תצוגת לקוח" : me?.fullName || me?.username || (isAdmin ? "גל" : "לקוח");
  const accountSub = previewClient ? "Preview" : me?.email || me?.username || (isAdmin ? "gal.z@ldrsgroup.com" : "");
  const lastUpdated = await getLastUpdated();
  // Brand now lives in the PATH; only the date window + preview flag go in the query.
  const rangeQs = range.key === "custom" ? `range=custom&from=${range.from}&to=${range.to}` : `range=${range.key}`;
  const rangeQuery = `?${rangeQs}${previewClient ? "&as=client" : ""}`; // appended to /<brand> for nav

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
            href={`/${brandId}?${rangeQs}&as=client`}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)]"
            title="ראה את הדשבורד כפי שהלקוח רואה אותו"
          >
            צפה כלקוח
          </a>
        )}
        {liveWarm ? (
          <LiveRefresher brand={brandId} active={range.to >= today()} warmPath="/api/live-warm" />
        ) : (
          <LiveRefresher brand={brandId} active />
        )}
        <DateRangeCalendar activeKey={range.key} from={range.from} to={range.to} brand={brandId} preview={previewClient} />
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
          <a href={`/${brandId}?${rangeQs}`} className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 font-medium text-[var(--foreground)] hover:border-[var(--muted)]">
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
        <BrandContent brand={brand} range={range} isClient={isClient} sub={sp.sub ?? ""} tab={sp.tab ?? ""} asParam={previewClient ? "&as=client" : ""} />
      </Suspense>
    </AppShell>
  );
}
