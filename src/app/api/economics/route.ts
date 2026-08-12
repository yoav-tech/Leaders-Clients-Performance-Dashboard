import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { campaignProfileOf, getBrand } from "@/lib/brands";
import { getEconomics, listEconomics, saveEconomics } from "@/lib/economicsStore";
import { deriveEconomics, validateEconomics, type UnitEconomics } from "@/lib/unitEconomics";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const s = await getServerSession();
  return s?.role === "admin" ? s : null;
}

const num = (v: unknown, fallback = NaN) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// GET [?brand=<id>] → one client's unit economics + the derivation, or all of them.
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const brand = new URL(request.url).searchParams.get("brand");
  if (brand) {
    const e = await getEconomics(brand);
    return NextResponse.json({ economics: e, derived: e ? deriveEconomics(e) : null });
  }
  return NextResponse.json({ economics: await listEconomics([]) });
}

// POST { brandId, ...unit economics } → store what the client confirmed, return the derivation.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const brandId = String(body.brandId ?? "");
  const brand = getBrand(brandId);
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  if (campaignProfileOf(brand) !== "ecommerce") {
    return NextResponse.json({ error: "יוניט אקונומיקס רלוונטי ללקוחות איקומרס בלבד" }, { status: 400 });
  }

  const economics: UnitEconomics = {
    aov: num(body.aov),
    grossMarginPct: num(body.grossMarginPct),
    shippingPerOrder: num(body.shippingPerOrder, 0),
    paymentFeePct: num(body.paymentFeePct, 0),
    otherVariablePerOrder: num(body.otherVariablePerOrder, 0),
    targetProfitShare: num(body.targetProfitShare, 0),
    ltvMultiple: num(body.ltvMultiple, 1),
    source: body.source ? String(body.source).slice(0, 200) : undefined,
    notes: body.notes ? String(body.notes).slice(0, 1000) : undefined,
  };

  const errors = validateEconomics(economics);
  if (errors.length) return NextResponse.json({ error: errors.join(" · ") }, { status: 400 });

  try {
    await saveEconomics(brandId, economics);
    return NextResponse.json({ ok: true, economics, derived: deriveEconomics(economics) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
