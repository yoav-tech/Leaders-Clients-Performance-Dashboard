// Does every active client actually reach every recurring report?
//
// Adding a brand to brands.ts is not enough on its own. Each recurring job iterates BRANDS, but
// several of them need something more before a brand produces output — an ad account to ingest, a
// config shape its digest branch understands, a recipient to mail. When one of those is missing the
// job moves on quietly, so the client simply never appears and nobody is told.
//
// That is not hypothetical: adding Tvuot (2026-09) surfaced that NINE of thirteen active brands
// were getting no weekly or monthly manager report at all, because no manager was attached to them
// in the permissions console and managerRun skipped them without a word.
//
// So coverage is computed here, in one place, and reported. Two consumers:
//   - the daily digest prints any gap to the media managers every morning until it's fixed
//   - `npm run check:coverage` prints the full matrix for a human
//
// When a recurring job gains a new precondition, add it here too — this file is the checklist a
// new client is measured against.
import { BRANDS, explorerChannels, reportGroupOf, type BrandConfig } from "./brands";
import { brandManagersByBrand } from "./recipients";

/** The recurring outputs a client is expected to appear in. */
export type ReportId = "ingest" | "digest" | "weekly" | "monthly" | "media-plan" | "store-products" | "alerts";

export interface CoverageCell {
  report: ReportId;
  /** covered = it produces output; n/a = deliberately out of scope; gap = it should and doesn't. */
  status: "covered" | "n/a" | "gap";
  reason: string;
}
export interface BrandCoverage {
  brandId: string;
  brandName: string;
  group: string;
  cells: CoverageCell[];
}

const ok = (report: ReportId, reason: string): CoverageCell => ({ report, status: "covered", reason });
const na = (report: ReportId, reason: string): CoverageCell => ({ report, status: "n/a", reason });
const gap = (report: ReportId, reason: string): CoverageCell => ({ report, status: "gap", reason });

// Hourly ingest — writes daily_metrics, which every DB-backed view and the e-commerce digest read.
function ingestCell(b: BrandConfig): CoverageCell {
  // Impression-share brands (Colgate) don't go through explorerChannels at all — ingestImpshareBrand
  // reads the accounts off googleSnapshot, so checking the meta/google/tiktok ids would call a
  // perfectly healthy account unconfigured.
  if (b.googleSnapshot?.length) return ok("ingest", `google snapshot · ${b.googleSnapshot.length} account(s)`);
  const channels = explorerChannels(b);
  if (!channels.length) return gap("ingest", "לא מוגדר אף חשבון מודעות (meta/google/tiktok) — הדשבורד יציג אפסים");
  return ok("ingest", `${channels.map((c) => c.id).join("+")}`);
}

// Daily digest — getGroupedDigest routes by reportGroupOf, and each branch has its own requirement.
// A brand whose group's requirement isn't met falls through every branch and is never printed.
function digestCell(b: BrandConfig): CoverageCell {
  const group = reportGroupOf(b);
  if (group === "ecommerce") return ok("digest", "e-commerce table (from daily_metrics)");
  if (group === "impshare") {
    return b.googleSnapshot ? ok("digest", "impression-share table") : gap("digest", "מסווג impshare אבל בלי googleSnapshot — אף ענף בדוח היומי לא תופס אותו");
  }
  if (group === "views") {
    if (b.awarenessSources?.length) return ok("digest", "views table (live awareness report)");
    if (b.mediaPlan) return ok("digest", "views table (from daily_metrics)");
    return gap("digest", "מסווג views אבל בלי awarenessSources ובלי mediaPlan — אף ענף בדוח היומי לא תופס אותו");
  }
  // leads
  if (b.appInstall) return ok("digest", "app table");
  if (b.perfSources?.length) return ok("digest", "leads table");
  return gap("digest", "מסווג leads אבל בלי appInstall ובלי perfSources — אף ענף בדוח היומי לא תופס אותו");
}

// Weekly + monthly account-manager emails. managerRun falls back to the media managers when no
// manager is attached, so the report always goes out; an unattached brand is still worth flagging
// because it is landing on the wrong desk.
function managerCell(report: "weekly" | "monthly", managers: string[]): CoverageCell {
  return managers.length
    ? ok(report, managers.join(", "))
    : gap(report, "אין מנהל משויך בקונסולת ההרשאות — הדוח נשלח בינתיים למנהלי המדיה");
}

function mediaPlanCell(b: BrandConfig): CoverageCell {
  // buildMediaPlan falls back to prior spend when monthlyBudget is 0, so only a brand with neither
  // is skipped — and that resolves itself once the account has history.
  return b.monthlyBudget > 0
    ? ok("media-plan", `budget ₪${b.monthlyBudget.toLocaleString("en-US")}`)
    : ok("media-plan", "no fixed budget — planned from spend history");
}

function storeProductsCell(b: BrandConfig): CoverageCell {
  if (!b.storePlatform) return na("store-products", "no store");
  if (!b.storeId && b.storePlatform === "quickshop") return na("store-products", "QuickShop store slug not set — awareness-only brand");
  return ok("store-products", b.storePlatform);
}

function alertsCell(b: BrandConfig): CoverageCell {
  // adHealthAlerts deliberately covers conversion brands only — the health rules are ROAS/CPA based
  // and say nothing useful about an awareness or impression-share account.
  const excluded = b.mediaPlan || b.appInstall || b.awarenessSources || b.googleSnapshot || b.perfSources;
  return excluded ? na("alerts", "non-conversion brand — ad-health rules don't apply") : ok("alerts", "ad-health alerts");
}

/** The full matrix for every brand that isn't retired. */
export async function getReportCoverage(): Promise<BrandCoverage[]> {
  const active = BRANDS.filter((b) => !b.retired);
  let managers: Record<string, string[]> = {};
  try {
    managers = await brandManagersByBrand(active.map((b) => b.id));
  } catch {
    managers = {}; // no DB (local/dev) — treat manager attachment as unknown rather than failing
  }
  return active.map((b) => {
    const mgr = managers[b.id] ?? [];
    return {
      brandId: b.id,
      brandName: b.name,
      group: reportGroupOf(b),
      cells: [
        ingestCell(b),
        digestCell(b),
        managerCell("weekly", mgr),
        managerCell("monthly", mgr),
        mediaPlanCell(b),
        storeProductsCell(b),
        alertsCell(b),
      ],
    };
  });
}

export interface CoverageGap { brandId: string; brandName: string; report: ReportId; reason: string }

export async function getCoverageGaps(): Promise<CoverageGap[]> {
  const cov = await getReportCoverage();
  const out: CoverageGap[] = [];
  for (const b of cov) {
    for (const c of b.cells) {
      if (c.status === "gap") out.push({ brandId: b.brandId, brandName: b.brandName, report: c.report, reason: c.reason });
    }
  }
  return out;
}

export const REPORT_LABEL_HE: Record<ReportId, string> = {
  ingest: "קליטת נתונים",
  digest: "דוח יומי",
  weekly: "דוח שבועי למנהל",
  monthly: "דוח חודשי למנהל",
  "media-plan": "תוכנית מדיה",
  "store-products": "מוצרי חנות",
  alerts: "התראות",
};

/** Gaps for one brand, with reports sharing a cause merged — the weekly and monthly reports always
 *  fail together on a missing manager, and printing that twice a day buries the rest. */
export function summarizeBrandGaps(gaps: CoverageGap[]): { report: string; reason: string }[] {
  const byReason = new Map<string, ReportId[]>();
  for (const g of gaps) byReason.set(g.reason, [...(byReason.get(g.reason) ?? []), g.report]);
  return [...byReason].map(([reason, reports]) => ({ report: reports.map((r) => REPORT_LABEL_HE[r]).join(" + "), reason }));
}

/** One block for the daily digest — empty string when every client is fully covered. */
export function renderCoverageGaps(gaps: CoverageGap[]): string {
  if (!gaps.length) return "";
  const byBrand = new Map<string, CoverageGap[]>();
  for (const g of gaps) byBrand.set(g.brandName, [...(byBrand.get(g.brandName) ?? []), g]);
  const lines = [...byBrand].map(([name, gs]) => `• ${name} — ${summarizeBrandGaps(gs).map((s) => `${s.report}: ${s.reason}`).join(" · ")}`);
  return `🔌 **לקוחות שלא מכוסים בדוחות הקבועים**\n${lines.join("\n")}`;
}
