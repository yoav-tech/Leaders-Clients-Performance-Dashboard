import type { BrandConfig } from "@/lib/brands";
import type { AppReport, AppSection, Totals } from "@/lib/appReport";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";
import AppLevelTable, { type Col } from "./AppLevelTable";
import RegionCostPanel from "./RegionCostPanel";
import ManualRegionPanel from "./HaatRegionSummaries";
import BudgetRequestPanel from "./BudgetRequestPanel";
import { HAAT_AUGUST_2026, HAAT_LAST_WEEK, HAAT_CITIES } from "@/lib/haatRegions";
import type { BudgetRequest } from "@/lib/budgetRequestStore";
import type { RegionCostReport } from "@/lib/regionCost";

const REACH_COLS: Col[] = [
  { label: "Spend", field: "spend", fmt: "ils" }, { label: "Impr", field: "impressions", fmt: "num" },
  { label: "Reach", field: "reach", fmt: "num" }, { label: "CPM", field: "cpm", fmt: "ils" }, { label: "CTR", field: "ctr", fmt: "pct" },
];
const INSTALL_COLS: Col[] = [
  { label: "Spend", field: "spend", fmt: "ils" }, { label: "Impr", field: "impressions", fmt: "num" }, { label: "Clicks", field: "clicks", fmt: "num" },
  { label: "CTR", field: "ctr", fmt: "pct" }, { label: "Installs", field: "installs", fmt: "num" }, { label: "CPI", field: "cpi", fmt: "ils" },
];
const REG_COLS: Col[] = [
  { label: "Spend", field: "spend", fmt: "ils" }, { label: "Clicks", field: "clicks", fmt: "num" }, { label: "CTR", field: "ctr", fmt: "pct" },
  { label: "Reg", field: "registrations", fmt: "num" }, { label: "CP-Reg", field: "cpReg", fmt: "ils" },
];
const LEADS_COLS: Col[] = [
  { label: "Spend", field: "spend", fmt: "ils" }, { label: "Impr", field: "impressions", fmt: "num" }, { label: "Clicks", field: "clicks", fmt: "num" },
  { label: "CTR", field: "ctr", fmt: "pct" }, { label: "Leads", field: "leads", fmt: "num" }, { label: "CP-Lead", field: "cpLead", fmt: "ils" },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}
function Stage({ label, count, cpaLabel, cpa, rate }: { label: string; count: number; cpaLabel: string; cpa: number | null; rate?: number | null }) {
  return (
    <div className="flex-1 rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">{formatNumber(count)}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">
        {cpaLabel} <span className="font-semibold text-[var(--foreground)]">{formatIls(cpa)}</span>
        {rate !== undefined ? <span className="ml-2">· {formatPct(rate)} מהשלב הקודם</span> : null}
      </div>
    </div>
  );
}

function Header({ t }: { t: Totals }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Spend" value={formatIls(t.spend)} />
      <Stat label="Impressions" value={formatNumber(t.impressions)} />
      <Stat label="Clicks" value={formatNumber(t.clicks)} />
      <Stat label="CTR" value={formatPct(t.ctr)} />
      <Stat label="CPC" value={formatIls(t.cpc)} />
      <Stat label="Reach" value={formatNumber(t.reach)} />
    </div>
  );
}

function Projection({ s }: { s: AppSection }) {
  const p = s.pacing!;
  if (s.kind === "app") {
    // Client's ask: only installs, budget, and cost-per-install.
    const cpi = p.installs ? p.monthSpend / p.installs : null;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="התקנות (MTD)" value={formatNumber(p.installs)} />
        <Stat label={`הוצאה (MTD, ${p.elapsed}d)`} value={formatIls(p.monthSpend)} />
        <Stat label="עלות התקנה (CPI)" value={formatIls(cpi)} />
        <Stat label="תקציב חודשי" value={s.budget > 0 ? formatIls(s.budget) : "— (set for pacing)"} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label={`Spent (MTD, ${p.elapsed}d)`} value={formatIls(p.monthSpend)} />
      <Stat label="Projected spend (EOM)" value={formatIls(p.projectedSpend)} />
      <Stat label="Projected leads (EOM)" value={formatNumber(p.projectedConversions)} />
      {s.budget > 0 ? (
        <Stat label="Budget / pace" value={`${formatIls(s.budget)} · ${Math.round((p.projectedSpend / s.budget) * 100)}%`} />
      ) : (
        <Stat label="Budget" value="— (set for pacing)" />
      )}
    </div>
  );
}

function Trend({ s }: { s: AppSection }) {
  const convLabel = s.kind === "leads" ? "Leads" : "Inst+Reg";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <th className="px-2 py-1.5 text-left">Day</th>
            <th className="px-2 py-1.5 text-right">Spend</th>
            <th className="px-2 py-1.5 text-right">{convLabel}</th>
            <th className="px-2 py-1.5 text-right">Cost/conv</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {[...s.trend].reverse().map((d) => (
            <tr key={d.date} className="border-t border-[var(--card-border)]">
              <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(d.spend)}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(d.conversions)}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(d.conversions ? d.spend / d.conversions : null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AppReportView({ brand, report, regionReport, from, to, isClient = false, budgetRequests, cityDailyBudgets }: { brand: BrandConfig; report: AppReport; regionReport?: RegionCostReport | null; from: string; to: string; isClient?: boolean; budgetRequests?: Record<string, BudgetRequest>; cityDailyBudgets?: Record<string, number> }) {
  const budget = brand.monthlyBudget;
  const mtdSpend = report.sections.reduce((a, s) => a + (s.pacing?.monthSpend ?? 0), 0);
  const projSpend = report.sections.reduce((a, s) => a + (s.pacing?.projectedSpend ?? 0), 0);

  const pacingPanel = budget > 0 && (
    <Panel title="Haat · total budget pacing (all sections, from ads)">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Monthly budget" value={formatIls(budget)} />
        <Stat label="Spent (MTD)" value={formatIls(mtdSpend)} />
        <Stat label="Projected EOM" value={formatIls(projSpend)} />
        <Stat label="Projected vs budget" value={`${Math.round((projSpend / budget) * 100)}%`} />
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
        <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (mtdSpend / budget) * 100)}%` }} />
      </div>
    </Panel>
  );

  // Client view: budget pacing + the two manual city summaries + the budget-request form. The
  // operational detail (overview, funnel, region cost, per-section pacing, ad tables, trend) is
  // for the team only.
  if (isClient) {
    return (
      <div className="space-y-6">
        {pacingPanel}
        <ManualRegionPanel summary={HAAT_LAST_WEEK} title="סיכום השבוע האחרון · הרשמות לפי עיר" />
        <ManualRegionPanel summary={HAAT_AUGUST_2026} title="סיכום חודשי · הרשמות לפי עיר" />
        <BudgetRequestPanel brandId={brand.id} cities={HAAT_CITIES} current={budgetRequests ?? {}} currentDaily={cityDailyBudgets ?? {}} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-[var(--muted)]">{brand.name} · LDRS-managed campaigns only · {from} → {to} · live from Windsor</div>

      {pacingPanel}

      {report.sections.map((s) => (
        <div key={s.key} className="space-y-4">
          <div className="text-base font-bold">{s.title}</div>

          <Panel title="Overview">
            <Header t={s.totals} />
            {s.kind === "leads" && (
              <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row">
                <Stage label="לידים · Leads" count={s.totals.leads} cpaLabel="Cost/lead" cpa={s.totals.cpLead} />
              </div>
            )}
          </Panel>

          {/* Under the overview: the client's own summaries — last week on top, then the month. */}
          {s.kind === "app" && <ManualRegionPanel summary={HAAT_LAST_WEEK} title="סיכום השבוע האחרון · הרשמות לפי עיר" />}
          {s.kind === "app" && <ManualRegionPanel summary={HAAT_AUGUST_2026} title="סיכום חודשי · הרשמות לפי עיר" />}

          {s.kind === "app" && (
            <Panel title="Funnel · הורדות → הרשמות → רכישות">
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <Stage label="הורדות · Downloads" count={s.totals.installs} cpaLabel="CPI" cpa={s.totals.cpi} />
                <span className="self-center text-[var(--muted)]">→</span>
                <Stage label="הרשמות · Registrations" count={s.totals.registrations} cpaLabel="Cost/reg" cpa={s.totals.cpReg} rate={s.totals.installs ? s.totals.registrations / s.totals.installs : null} />
                <span className="self-center text-[var(--muted)]">→</span>
                <Stage label="רכישות · Purchases" count={s.totals.purchases} cpaLabel="Cost/purchase" cpa={s.totals.cpPurch} />
              </div>
            </Panel>
          )}

          {/* Cost per registration by region (last 3 days vs start of month) — the client's ask. */}
          {s.kind === "app" && regionReport && regionReport.rows.length > 0 && <RegionCostPanel report={regionReport} />}

          {s.pacing && (
            <Panel title="Budget pacing & projection · from ads">
              <Projection s={s} />
            </Panel>
          )}

          {s.kind === "app" ? (
            <>
              <Panel title="REACH · לפי קמפיין / אד-גרופ / מודעה · פילטר עיר">
                <AppLevelTable rows={s.rows.filter((r) => r.type === "reach")} cols={REACH_COLS} minWidth={560} />
              </Panel>
              <Panel title="INSTALL · לפי קמפיין / אד-גרופ / מודעה · פילטר עיר">
                <AppLevelTable rows={s.rows.filter((r) => r.type === "install")} cols={INSTALL_COLS} />
              </Panel>
              <Panel title="REG · לפי קמפיין / אד-גרופ / מודעה · פילטר עיר">
                <AppLevelTable rows={s.rows.filter((r) => r.type === "registration")} cols={REG_COLS} />
              </Panel>
            </>
          ) : (
            <Panel title="Leads · לפי קמפיין / אד-גרופ / מודעה · פילטר עיר">
              <AppLevelTable rows={s.rows} cols={LEADS_COLS} />
            </Panel>
          )}

          {s.trend.length > 0 && !isClient && (
            <Panel title="Trend · spend & conversions">
              <Trend s={s} />
            </Panel>
          )}
        </div>
      ))}
    </div>
  );
}
