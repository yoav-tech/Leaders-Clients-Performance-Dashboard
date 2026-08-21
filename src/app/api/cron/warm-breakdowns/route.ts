import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { safeEqual } from "@/lib/auth";
import { warmBreakdowns, warmLiveReports } from "@/lib/breakdownData";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // slow shared-account brands (Windsor) — runs in the background

// Keep the breakdown-explorer cache hot: expire the breakdown entries (same 30-min cadence as their
// TTL) and immediately re-warm each brand's landing view (first channel · campaign · this-month), so
// the first real visitor gets an instant load instead of a cold Windsor fetch.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (!(await safeEqual(provided, secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    revalidateTag("breakdown");
    const [breakdowns, liveReports] = await Promise.all([warmBreakdowns(), warmLiveReports()]);
    return NextResponse.json({ ok: true, breakdowns, liveReports });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
