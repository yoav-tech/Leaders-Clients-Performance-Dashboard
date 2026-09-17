import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { getBrandTargets, saveBrandTargets, targetFieldsFor, num } from "@/lib/brandTargets";

export const dynamic = "force-dynamic";

// GET  /api/brand-targets?brand=argania   — what a media manager has set, if anything.
// PUT  /api/brand-targets { brand, ...targets }
//
// Media managers only. A field left empty falls back to the configured value rather than being
// stored as zero, so the configured figure stays visible and an override is always deliberate.
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const brand = getBrand(new URL(request.url).searchParams.get("brand") ?? "");
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, fields: targetFieldsFor(brand), targets: await getBrandTargets(brand.id) });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Only the goals that mean something for this brand's report type. A ROAS target on an awareness
  // client would be stored, shown nowhere, and quietly confuse whoever read the table next.
  const allowed = new Set<string>(targetFieldsFor(brand));
  const pick = (k: string) => (allowed.has(k) ? num(body[k]) : null);
  try {
    await saveBrandTargets(brand.id, {
      monthlyBudget: pick("monthlyBudget"), targetRoas: pick("targetRoas"), targetCpv: pick("targetCpv"),
      targetCpl: pick("targetCpl"), targetCpReg: pick("targetCpReg"),
    }, session.sub ?? null);
    return NextResponse.json({ ok: true, targets: await getBrandTargets(brand.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
