import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getBrand } from "@/lib/brands";
import { getPlan, listPlans } from "@/lib/mediaPlanStore";
import { buildDraftFor, sendApprovedPlan } from "@/lib/mediaPlanRun";
import { brandManagers } from "@/lib/recipients";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function requireAdmin() {
  const s = await getServerSession();
  return s?.role === "admin" ? s : null;
}

// GET ?month=YYYY-MM[&brand=<id>] → the stored plan(s) for a month.
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const month = sp.get("month") ?? "";
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  const brand = sp.get("brand");
  if (brand) return NextResponse.json({ plan: await getPlan(brand, month) });
  return NextResponse.json({ plans: await listPlans(month) });
}

// POST { action, brandId, month, budget?, to? }
//   rebuild → re-derive the draft (optionally with a manager-set budget); clears any approval
//   send    → approve the draft and email the client's account manager
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    brandId?: string;
    month?: string;
    budget?: unknown;
    to?: string;
  };
  const brandId = String(body.brandId ?? "");
  const month = String(body.month ?? "");
  if (!getBrand(brandId)) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });

  try {
    if (body.action === "rebuild") {
      const raw = Number(body.budget);
      const budget = Number.isFinite(raw) && raw > 0 ? raw : undefined;
      const draft = await buildDraftFor(brandId, month, { budgetOverride: budget, force: true });
      return NextResponse.json({ ok: true, plan: await getPlan(draft.brandId, draft.month) });
    }

    if (body.action === "send") {
      const overrideTo = body.to ? String(body.to).trim() : undefined;
      if (!overrideTo && !(await brandManagers(brandId)).length) {
        return NextResponse.json({ error: "לא משויך מנהל מותג ללקוח הזה — הוסף אותו במסך ההרשאות" }, { status: 400 });
      }
      const r = await sendApprovedPlan(brandId, month, { approvedBy: session.sub, overrideTo });
      if (!r.ok) return NextResponse.json({ error: r.error ?? "send failed" }, { status: 400 });
      return NextResponse.json({ ok: true, to: r.to, plan: await getPlan(brandId, month) });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
