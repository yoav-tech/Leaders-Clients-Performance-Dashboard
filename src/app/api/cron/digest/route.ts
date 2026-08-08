import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { getDigestData, renderDigestText } from "@/lib/digest";
import { renderDigestEmail } from "@/lib/emailDigest";
import { postMessage, clickupConfigured } from "@/lib/clickup";
import { emailConfigured, sendEmail } from "@/lib/email";
import { mediaManagers } from "@/lib/recipients";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Morning digest → ClickUp + email to the media managers (stage 1). `?dry=1` = preview, no send.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/digest");
  if (denied) return denied;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const data = await getDigestData(); // computed once → reused for ClickUp + email
    const text = renderDigestText(data);

    let posted = false;
    if (!dry && clickupConfigured()) {
      await postMessage(text);
      posted = true;
    }

    // Stage 1: email the daily digest to the media managers.
    let emailed: string[] = [];
    const to = mediaManagers();
    if (!dry && emailConfigured() && to.length) {
      const { subject, html, text: plain } = renderDigestEmail(data);
      await sendEmail({ to, subject, html, text: plain });
      emailed = to;
    }

    return NextResponse.json({ ok: true, posted, emailed, preview: text });
  } catch (e) {
    console.error("[cron/digest] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
