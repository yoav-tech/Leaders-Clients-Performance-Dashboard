import { NextResponse } from "next/server";
import { getBrand, reportGroupOf } from "@/lib/brands";
import { getClientReport } from "@/lib/clientReport";
import { getTopProducts } from "@/lib/topProducts";
import { getBrandMetrics } from "@/lib/queries";
import { ecomInsights } from "@/lib/reportInsights";
import { buildEcomClientConclusions } from "@/lib/clientConclusions";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { getInsightFeedback } from "@/lib/insightFeedbackStore";
import { saveDraftedLines } from "@/lib/insightLearning";
import { getAccountChanges } from "@/lib/accountChanges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/client-report/conclusions { brand, from, to }
// Drafts client-facing conclusions from the recommendation engine (no model call). Media managers
// only, and only for e-commerce brands — the other report types have their own insight generators
// but no client-facing voice written for them yet.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (reportGroupOf(brand) !== "ecommerce") {
    return NextResponse.json({ error: "טיוטת מסקנות זמינה כרגע ללקוחות איקומרס בלבד" }, { status: 400 });
  }
  const from = String(body.from ?? ""), to = String(body.to ?? "");
  if (!from || !to) return NextResponse.json({ error: "missing range" }, { status: 400 });

  try {
    // Same inputs the monthly-preview cron feeds the rules, so the draft and the internal review
    // are built from one set of facts.
    const [report, products, allMetrics, feedback, changes] = await Promise.all([
      getClientReport(brand, from, to),
      getTopProducts(brand, from, to).catch(() => null),
      getBrandMetrics(from, to).catch(() => []),
      getInsightFeedback(brand.id),
      // Reading the account is the slowest part and the least essential — a draft without the
      // change list is still a draft, one that fails outright is not.
      getAccountChanges(brand, from, to).catch(() => null),
    ]);
    if (!report) return NextResponse.json({ error: "אין נתונים לטווח שנבחר" }, { status: 404 });

    const bm = allMetrics.find((m) => m.brandId === brand.id);
    const audience = bm ? { newRevenue: bm.newRevenue, storeRevenue: bm.channels.site.revenue } : undefined;
    const insights = ecomInsights(brand, report, products, audience);
    const draft = buildEcomClientConclusions(brand, report, insights, products, feedback, changes);
    // Remember what was drafted. When the manager sends the report, whatever they turned this into
    // is diffed against it, and that difference is what teaches the engine — so nothing has to be
    // rated by hand. See insightLearning.ts.
    const byId = new Map(insights.filter((i) => i.id).map((i) => [i.id!, i.data ?? {}]));
    await saveDraftedLines(brand.id, from, to,
      draft.lines.map((l) => ({ id: l.id, text: l.text, data: byId.get(l.id) ?? {} }))).catch(() => {});

    return NextResponse.json({ ok: true, ...draft });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
