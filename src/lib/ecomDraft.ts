// Building an e-commerce client draft from one set of inputs.
//
// Two callers need the identical draft: the dashboard button that shows it to the manager, and the
// send path, which needs to know what the engine WOULD have written in order to diff it against
// what actually went out. Having each assemble its own inputs is how they drift apart, and a
// learning signal computed against a slightly different draft is worse than none.
import type { BrandConfig } from "./brands";
import { getClientReport } from "./clientReport";
import { getTopProducts } from "./topProducts";
import { getBrandMetrics } from "./queries";
import { ecomInsights } from "./reportInsights";
import { getInsightFeedback } from "./insightFeedbackStore";
import { getAccountChanges } from "./accountChanges";
import { buildEcomClientConclusions, type ClientConclusionsDraft } from "./clientConclusions";
import type { DraftedLine } from "./insightLearning";

export interface EcomDraft {
  draft: ClientConclusionsDraft;
  /** The lines plus the figures behind them — what the learning diff needs. */
  lines: DraftedLine[];
}

export async function buildEcomDraft(brand: BrandConfig, from: string, to: string): Promise<EcomDraft | null> {
  const [report, products, allMetrics, feedback, changes] = await Promise.all([
    getClientReport(brand, from, to),
    getTopProducts(brand, from, to).catch(() => null),
    getBrandMetrics(from, to).catch(() => []),
    getInsightFeedback(brand.id),
    // Reading the account is the slowest part and the least essential — a draft without the change
    // list is still a draft, one that fails outright is not.
    getAccountChanges(brand, from, to).catch(() => null),
  ]);
  if (!report) return null;

  const bm = allMetrics.find((m) => m.brandId === brand.id);
  const audience = bm ? { newRevenue: bm.newRevenue, storeRevenue: bm.channels.site.revenue } : undefined;
  const insights = ecomInsights(brand, report, products, audience);
  const draft = buildEcomClientConclusions(brand, report, insights, products, feedback, changes);

  const byId = new Map(insights.filter((i) => i.id).map((i) => [i.id!, i.data ?? {}]));
  return {
    draft,
    lines: draft.lines.map((l) => ({ id: l.id, text: l.text, data: byId.get(l.id) ?? {} })),
  };
}
