import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getClientReport } from "@/lib/clientReport";
import { getReportNote, type ReportPeriod } from "@/lib/clientReportStore";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const parsePeriod = (v: string | null): ReportPeriod => (v === "week" || v === "month" ? v : "custom");

// GET /api/client-report?brand=&from=&to=&period=  → { report, note, canEdit } (session-gated).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const period = parsePeriod(url.searchParams.get("period"));
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  const session = await getServerSession();
  if (!canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Only media managers (admin/manager) may edit + send; clients see the note read-only.
  const canEdit = session?.role === "admin" || session?.role === "manager";
  try {
    const [report, note] = await Promise.all([getClientReport(brand, from, to), getReportNote(brand.id, period, from, to)]);
    return NextResponse.json({ report, note, canEdit });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
