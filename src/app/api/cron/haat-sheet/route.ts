import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { fetchHaatWeeklySheet } from "@/lib/haatSheet";
import { saveSnapshot, HAAT_WEEKLY_KEY } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const israelHour = () =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).format(new Date()));

// Pull Haat's weekly cost-per-registration tab from the team's Google Sheet and store it.
// Scheduled Sunday / Tuesday / Thursday at 12:00 Israel time.
//
// Vercel crons only run on UTC, and Israel shifts between UTC+3 (summer) and UTC+2 (winter), so
// noon local is 09:00 UTC for part of the year and 10:00 UTC for the rest. We fire on both hours
// and keep whichever one is actually noon in Israel — so the job lands at 12:00 all year without
// anyone having to remember the clock change. Pass ?force=1 to run it by hand at any hour.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (!(await safeEqual(provided, secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const hour = israelHour();
  if (url.searchParams.get("force") !== "1" && hour !== 12) {
    return NextResponse.json({ ok: true, skipped: `not noon in Israel (local hour ${hour})` });
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
