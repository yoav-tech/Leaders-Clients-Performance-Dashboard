import { NextResponse } from "next/server";
import { getBrand, reportGroupOf } from "@/lib/brands";
import { buildEcomDraft } from "@/lib/ecomDraft";
import { saveDraftedLines } from "@/lib/insightLearning";
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
    const built = await buildEcomDraft(brand, from, to);
    if (!built) return NextResponse.json({ error: "אין נתונים לטווח שנבחר" }, { status: 404 });

    // Remember what was drafted so the send can be diffed against it. This is an optimisation, not
    // a dependency: the send path rebuilds the draft when no row is found, so learning survives a
    // failure here. It still reports one — a write that failed silently once left the table empty
    // with nothing anywhere saying why.
    let recorded = built.lines.length > 0;
    try {
      await saveDraftedLines(brand.id, from, to, built.lines);
    } catch (e) {
      recorded = false;
      console.error("[client-report/conclusions] could not record the draft for learning:", e instanceof Error ? e.message : String(e));
    }

    return NextResponse.json({ ok: true, ...built.draft, recorded });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
