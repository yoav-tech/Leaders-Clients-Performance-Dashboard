import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { shiftDate, today } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-ingest a trailing window each run so gaps self-heal: Windsor backfill lag,
// Meta/TikTok attribution updates, and store order status changes (pending → paid).
const ROLLING_DAYS = 14;

// Triggered by Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>`).
// Also callable manually with ?secret=<CRON_SECRET> and optional ?from=&to= to backfill.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  const provided = auth?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");

  if (secret && provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Default to a trailing window; explicit ?from=&to= overrides (for manual backfills).
  const to = url.searchParams.get("to") ?? today();
  const from = url.searchParams.get("from") ?? shiftDate(to, -(ROLLING_DAYS - 1));

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
