import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { saveReportNote, type ReportPeriod } from "@/lib/clientReportStore";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";

export const dynamic = "force-dynamic";

const parsePeriod = (v: unknown): ReportPeriod => (v === "week" || v === "month" ? v : "custom");

// PATCH /api/client-report/note  { brand, period, from, to, note }  — media managers only.
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const from = String(body.from ?? ""), to = String(body.to ?? "");
  if (!from || !to) return NextResponse.json({ error: "missing range" }, { status: 400 });
  try {
    await saveReportNote(brand.id, parsePeriod(body.period), from, to, String(body.note ?? "").slice(0, 5000));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
