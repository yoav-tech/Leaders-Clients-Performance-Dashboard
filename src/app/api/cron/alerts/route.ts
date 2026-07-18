import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { collectAlerts, filterUnsent, recordSent } from "@/lib/alerts";
import { formatAlertBatch } from "@/lib/digest";
import { postMessage, clickupConfigured } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Live alerts → ClickUp. Runs periodically; only newly-fired (un-deduped) alerts are posted.
// `?dry=1` computes without posting/recording.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/alerts");
  if (denied) return denied;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const all = await collectAlerts();
    const fresh = await filterUnsent(all);
    if (fresh.length && !dry && clickupConfigured()) {
      await postMessage(formatAlertBatch(fresh));
      await recordSent(fresh);
    }
    return NextResponse.json({ ok: true, total: all.length, new: fresh.length, posted: fresh.length && !dry && clickupConfigured() ? true : false, alerts: fresh });
  } catch (e) {
    console.error("[cron/alerts] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
