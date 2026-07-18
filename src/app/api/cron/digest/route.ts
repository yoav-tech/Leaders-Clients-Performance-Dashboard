import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { buildDigest } from "@/lib/digest";
import { postMessage, clickupConfigured } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Morning digest → ClickUp. Scheduled ~07:30 Israel. `?dry=1` returns the preview without posting.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/digest");
  if (denied) return denied;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const text = await buildDigest();
    if (!dry && clickupConfigured()) await postMessage(text);
    return NextResponse.json({ ok: true, posted: !dry && clickupConfigured(), preview: text });
  } catch (e) {
    console.error("[cron/digest] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
