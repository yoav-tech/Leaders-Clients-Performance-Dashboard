import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { getGroupedDigest, renderGroupedText } from "@/lib/digestGroups";
import { buildGroupedEmailFrom } from "@/lib/emailDigest";
import { postMessage, clickupConfigured } from "@/lib/clickup";
import { emailConfigured, sendEmail } from "@/lib/email";
import { mediaManagers } from "@/lib/recipients";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Morning digest → ClickUp + email to the media managers (stage 1). `?dry=1` = preview, no send.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/digest");
  if (denied) return denied;

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  // Vercel crons run in UTC only, so we schedule at 07:00 + 08:00 UTC (Sun–Thu) and actually send
  // only at 10:00 Israel time — this fires exactly once whether Israel is on IST (UTC+2) or IDT
  // (UTC+3). force=1 bypasses the gate for manual/test sends.
  if (!force) {
    const israelHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).formatToParts(new Date()).find((p) => p.type === "hour")?.value);
    if (israelHour !== 10) return NextResponse.json({ ok: true, skipped: `israel hour ${israelHour} ≠ 10` });
  }
  try {
    const data = await getGroupedDigest(); // computed once → reused for ClickUp + email
    const text = renderGroupedText(data);

    let posted = false;
    if (!dry && clickupConfigured()) {
      await postMessage(text);
      posted = true;
    }

    // Stage 1: email the daily digest to the media managers.
    let emailed: string[] = [];
    const to = mediaManagers();
    if (!dry && emailConfigured() && to.length) {
      const { subject, html, text: plain } = await buildGroupedEmailFrom(data);
      await sendEmail({ to, subject, html, text: plain });
      emailed = to;
    }

    return NextResponse.json({ ok: true, posted, emailed, preview: text });
  } catch (e) {
    console.error("[cron/digest] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
