// Building a client-facing draft for any brand, from one set of inputs.
//
// Two callers need the identical draft: the dashboard button that shows it to the manager, and the
// send path, which needs to know what the engine WOULD have written in order to diff it against
// what actually went out. Having each assemble its own inputs is how they drift apart, and a
// learning signal computed against a slightly different draft is worse than none.
//
// Every report type routes through here, so a new client gets conclusions from the day its profile
// is set — there is no per-brand wiring to remember.
import type { BrandConfig } from "./brands";
import { campaignProfileOf, reportGroupOf } from "./brands";
import { getClientReport, periodLabel } from "./clientReport";
import { getTopProducts } from "./topProducts";
import { getBrandMetrics } from "./queries";
import { getCampaignBrandMetrics } from "./campaignMetrics";
import { getAppReport } from "./appReport";
import { getSearchSnapshot } from "./searchSnapshot";
import { viewsInsights, appInsights, ecomInsights, leadsInsights, impShareInsights, type Insight } from "./reportInsights";
import { getInsightFeedback } from "./insightFeedbackStore";
import { getAccountChanges } from "./accountChanges";
import {
  buildEcomClientConclusions, buildViewsClientConclusions, buildLeadsClientConclusions,
  buildAppClientConclusions, buildImpshareClientConclusions, type ClientConclusionsDraft,
} from "./clientConclusions";
import type { DraftedLine } from "./insightLearning";

export interface ClientDraft {
  draft: ClientConclusionsDraft;
  /** The lines plus the figures behind them — what the learning diff needs. */
  lines: DraftedLine[];
}

const pack = (draft: ClientConclusionsDraft, insights: Insight[]): ClientDraft => {
  const byId = new Map(insights.filter((i) => i.id).map((i) => [i.id!, i.data ?? {}]));
  return { draft, lines: draft.lines.map((l) => ({ id: l.id, text: l.text, data: byId.get(l.id) ?? {} })) };
};

/** Reading the account is the slowest part of a draft and the least essential — a draft without the
 *  change list is still a draft, one that fails outright is not. */
const changesFor = (brand: BrandConfig, from: string, to: string) =>
  getAccountChanges(brand, from, to).catch(() => null);

export async function buildClientDraft(brand: BrandConfig, from: string, to: string): Promise<ClientDraft | null> {
  const group = reportGroupOf(brand);
  const profile = campaignProfileOf(brand);
  const label = periodLabel(from, to);
  const feedback = await getInsightFeedback(brand.id);

  if (group === "ecommerce") {
    const [report, products, allMetrics, changes] = await Promise.all([
      getClientReport(brand, from, to),
      getTopProducts(brand, from, to).catch(() => null),
      getBrandMetrics(from, to).catch(() => []),
      changesFor(brand, from, to),
    ]);
    if (!report) return null;
    const bm = allMetrics.find((m) => m.brandId === brand.id);
    const audience = bm ? { newRevenue: bm.newRevenue, storeRevenue: bm.channels.site.revenue } : undefined;
    const insights = ecomInsights(brand, report, products, audience);
    return pack(buildEcomClientConclusions(brand, report, insights, products, feedback, changes), insights);
  }

  if (profile === "app") {
    const [r, changes] = await Promise.all([getAppReport(brand, from, to), changesFor(brand, from, to)]);
    if (!r) return null;
    const insights = appInsights(brand, r);
    return pack(buildAppClientConclusions(brand, label, r, insights, feedback, changes), insights);
  }

  if (group === "impshare") {
    const r = await getSearchSnapshot(brand, from, to);
    if (!r) return null;
    // Impression-share brands have no ad accounts in the usual fields, so there is no campaign-level
    // change list to read for them.
    const insights = impShareInsights(brand, r.sections);
    return pack(buildImpshareClientConclusions(brand, label, r.sections, insights, feedback, null), insights);
  }

  // views / leads — both read the same campaign metrics; only the KPI differs.
  const [m, changes] = await Promise.all([getCampaignBrandMetrics(brand, from, to), changesFor(brand, from, to)]);
  if (!m || (m.total.spend <= 0 && m.total.impressions <= 0)) return null;

  if (group === "views") {
    const insights = viewsInsights(brand, m);
    return pack(buildViewsClientConclusions(brand, label, m, insights, feedback, changes), insights);
  }
  const insights = leadsInsights(brand, m);
  return pack(buildLeadsClientConclusions(brand, label, m, insights, feedback, changes), insights);
}
