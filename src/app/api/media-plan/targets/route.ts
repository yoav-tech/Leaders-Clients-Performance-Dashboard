import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { getPlanTargets, savePlanTargets, type PlanTargetRow } from "@/lib/planTargets";

export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// GET /api/media-plan/targets?brand=chery — what the media manager has set, if anything.
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const brand = getBrand(new URL(request.url).searchParams.get("brand") ?? "");
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, targets: await getPlanTargets(brand.id) });
}

// PUT /api/media-plan/targets { brand, lines: [{platform, budget, thruplay, completedViews}], leads }
//
// Media managers only. A field left empty falls back to the plan as signed rather than being stored
// as zero — the signed figures stay in the config and remain visible.
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    brand?: string;
    lines?: { platform?: string; budget?: unknown; thruplay?: unknown; completedViews?: unknown }[];
    leads?: { leads?: unknown; cpa?: unknown } | null;
  };
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!brand.platformPlan) return NextResponse.json({ error: "למותג הזה אין פריסת מדיה" }, { status: 400 });

  // Only platforms the plan actually has — an override for a platform that isn't in the flight
  // would never be read and would just sit in the table looking meaningful.
  const allowed = new Set(brand.platformPlan.lines.map((l) => l.platform));
  const lines: PlanTargetRow[] = (body.lines ?? [])
    .filter((l) => allowed.has(String(l.platform ?? "") as never))
    .map((l) => ({
      platform: String(l.platform),
      budget: num(l.budget), thruplay: num(l.thruplay), completedViews: num(l.completedViews),
    }));

  const leads = body.leads
    ? { leads: num(body.leads.leads), cpa: num(body.leads.cpa) }
    : null;

  try {
    await savePlanTargets(brand.id, lines, leads, session.sub ?? null);
    return NextResponse.json({ ok: true, targets: await getPlanTargets(brand.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
