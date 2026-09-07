import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { fetchHaatWeeklySheet } from "@/lib/haatSheet";
import { saveSnapshot, HAAT_WEEKLY_KEY } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pull Haat's weekly cost-per-registration tab from the team's Google Sheet and store it.
// Scheduled Sunday / Tuesday / Thursday, matching how the team refreshes the sheet.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (!(await safeEqual(provided, secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await fetchHaatWeeklySheet();
    await saveSnapshot(HAAT_WEEKLY_KEY, summary);
    return NextResponse.json({
      ok: true,
      cities: summary.rows.length,
      spend: summary.total.spend,
      registrations: summary.total.regs,
      costPerRegistration: summary.total.cpr,
      capturedAt: summary.capturedAt,
    });
  } catch (e) {
    // Surface the reason (usually a revoked share link) rather than silently keeping stale data.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
