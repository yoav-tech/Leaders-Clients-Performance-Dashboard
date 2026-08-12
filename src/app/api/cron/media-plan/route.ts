import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { buildMonthlyDrafts } from "@/lib/mediaPlanRun";
import { AUTOMATION, RULES_VERSION } from "@/lib/mediaPlanRules";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // per brand: 90-day DB lookback + campaign read + an LLM call

// Monthly media plans → built on the 24th for the NEXT calendar month (see vercel.json), stored
// as drafts, and mailed to the media managers for approval. Never mails a client directly.
//
// The scheduled run is INERT until the planning rules are signed off: it does nothing unless
// MEDIA_PLAN_AUTOMATION=on. Building on demand from /media-plan is unaffected, and ?dry=1 or
// ?run=1 still work here for testing while the automation is off.
//   ?dry=1                 → build only, return a text preview (nothing stored, nothing sent)
//   ?run=1                 → run for real even while the automation flag is off
//   ?month=YYYY-MM         → build a specific month instead of next month
//   ?brand=<id>            → a single client
//   ?force=1               → rebuild even over an already approved/sent plan
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/media-plan");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const dry = sp.get("dry") === "1";
  if (!AUTOMATION.enabled && !dry && sp.get("run") !== "1") {
    return NextResponse.json({
      ok: true,
      skipped: "automation disabled",
      rulesVersion: RULES_VERSION,
      hint: "Set MEDIA_PLAN_AUTOMATION=on once the planning rules in mediaPlanRules.ts are approved. Plans can still be built on demand from /media-plan.",
    });
  }
  const month = sp.get("month");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  try {
    const r = await buildMonthlyDrafts({
      month: month ?? undefined,
      dry,
      onlyBrand: sp.get("brand") ?? undefined,
      force: sp.get("force") === "1",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
