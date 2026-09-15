import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { saveInsightFeedback, clearInsightFeedback, getInsightFeedback } from "@/lib/insightFeedbackStore";
import { toTemplate } from "@/lib/insightTemplate";

export const dynamic = "force-dynamic";

// POST /api/client-report/insight-feedback
//   { brand, insightId, action: "approve" | "correct" | "reset", text?, original?, data? }
//
// Teaches the recommendation engine. "approve" records that the generated wording is right for this
// client; "correct" stores the manager's wording as a template whose figures are placeholders, so
// it is re-rendered against each new period instead of replaying the one it was written in.
// Media managers only.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const insightId = String(body.insightId ?? "");
  if (!insightId) return NextResponse.json({ error: "missing insightId" }, { status: 400 });
  const action = String(body.action ?? "");
  const by = session.sub ?? null;

  try {
    if (action === "reset") {
      await clearInsightFeedback(brand.id, insightId);
      return NextResponse.json({ ok: true, status: null });
    }

    if (action === "approve") {
      await saveInsightFeedback(brand.id, {
        insightId, status: "approved", template: null, correctedRaw: null,
        original: String(body.original ?? "").slice(0, 4000), unresolved: [], updatedBy: by,
      });
      return NextResponse.json({ ok: true, status: "approved" });
    }

    if (action === "correct") {
      const text = String(body.text ?? "").trim().slice(0, 4000);
      if (!text) return NextResponse.json({ error: "התיקון ריק" }, { status: 400 });
      // The figures the rule computed for the period the manager was looking at. Everything in the
      // correction that matches one of them becomes a placeholder; everything else is reported back
      // so they know which numbers will be frozen into the wording.
      const data: Record<string, number> = {};
      for (const [k, v] of Object.entries((body.data ?? {}) as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n)) data[k] = n;
      }
      const { template, unresolved } = toTemplate(text, data);
      await saveInsightFeedback(brand.id, {
        insightId, status: "corrected", template, correctedRaw: text,
        original: String(body.original ?? "").slice(0, 4000), unresolved, updatedBy: by,
      });
      return NextResponse.json({ ok: true, status: "corrected", template, unresolved });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// GET /api/client-report/insight-feedback?brand=<id> — what's been taught for this brand.
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const brand = getBrand(new URL(request.url).searchParams.get("brand") ?? "");
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, feedback: await getInsightFeedback(brand.id) });
}
