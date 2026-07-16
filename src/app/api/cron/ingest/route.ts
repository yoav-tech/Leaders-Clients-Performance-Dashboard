import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { shiftDate, today } from "@/lib/dates";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-ingest a trailing window each run so gaps self-heal: Windsor backfill lag,
// Meta/TikTok attribution updates, and store order status changes (pending → paid).
const ROLLING_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Triggered by Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>`).
// Also callable manually with ?secret=<CRON_SECRET> and optional ?from=&to= to backfill.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: a write endpoint must never be open. Require the secret to be configured.
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  const provided = auth?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (!(await safeEqual(provided, secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate date params; ignore anything not YYYY-MM-DD.
  const toParam = url.searchParams.get("to");
  const fromParam = url.searchParams.get("from");
  const to = toParam && DATE_RE.test(toParam) ? toParam : today();
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : shiftDate(to, -(ROLLING_DAYS - 1));

  try {
    const result = await runIngest({ from, to });
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
