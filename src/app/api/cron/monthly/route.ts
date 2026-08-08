import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { sendManagerReports } from "@/lib/managerRun";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Monthly account-manager reports → sent on the 1st, for the previous calendar month (vercel.json).
//   ?dry=1 · ?brand=<id>&to=<email>  (same test hooks as the weekly cron)
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/monthly");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  try {
    const r = await sendManagerReports("month", {
      dry: sp.get("dry") === "1",
      onlyBrand: sp.get("brand") ?? undefined,
      overrideTo: sp.get("to") ?? undefined,
    });
    return NextResponse.json({ ok: true, period: "month", ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
