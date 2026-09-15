import { NextResponse } from "next/server";
import { getBrand, reportGroupOf } from "@/lib/brands";
import { getClientReport } from "@/lib/clientReport";
import { getTopProducts } from "@/lib/topProducts";
import { getBrandMetrics } from "@/lib/queries";
import { ecomInsights } from "@/lib/reportInsights";
import { buildEcomClientConclusions } from "@/lib/clientConclusions";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";

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
    const [report, products, allMetrics] = await Promise.all([
      getClientReport(brand, from, to),
      getTopProducts(brand, from, to).catch(() => null),
      getBrandMetrics(from, to).catch(() => []),
    ]);
    if (!report) return NextResponse.json({ error: "אין נתונים לטווח שנבחר" }, { status: 404 });

    const bm = allMetrics.find((m) => m.brandId === brand.id);
    const audience = bm ? { newRevenue: bm.newRevenue, storeRevenue: bm.channels.site.revenue } : undefined;
    const insights = ecomInsights(brand, report, products, audience);
    const draft = buildEcomClientConclusions(brand, report, insights, products);

    return NextResponse.json({ ok: true, ...draft });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
