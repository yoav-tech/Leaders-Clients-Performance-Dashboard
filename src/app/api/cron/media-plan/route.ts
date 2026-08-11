import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { buildMonthlyDrafts } from "@/lib/mediaPlanRun";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // per brand: 90-day DB lookback + campaign read + an LLM call

// Monthly media plans → built on the 24th for the NEXT calendar month (see vercel.json), stored
// as drafts, and mailed to the media managers for approval. Never mails a client directly.
//   ?dry=1                 → build only, return a text preview (nothing stored, nothing sent)
//   ?month=YYYY-MM         → build a specific month instead of next month
//   ?brand=<id>            → a single client
//   ?force=1               → rebuild even over an already approved/sent plan
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/media-plan");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const month = sp.get("month");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  try {
    const r = await buildMonthlyDrafts({
      month: month ?? undefined,
      dry: sp.get("dry") === "1",
      onlyBrand: sp.get("brand") ?? undefined,
      force: sp.get("force") === "1",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
