import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { listMessages, postMessage, botUserId, clickupConfigured } from "@/lib/clickup";
import { answerQuestion, anthropicConfigured } from "@/lib/qa";
import { getSupabase, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Trigger: a channel message starting with "ask:" (case-insensitive). e.g. "ask: how is Argania doing?"
const TRIGGER = /^\s*ask:\s*/i;
const STATE_KEY = "poll_last_ts";

// Poll the ClickUp channel for new question messages, answer via the LLM, reply in-thread.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/clickup-poll");
  if (denied) return denied;

  if (!clickupConfigured() || !anthropicConfigured() || !hasDb()) {
    return NextResponse.json({ error: "not configured (clickup / anthropic / db)" }, { status: 503 });
  }

  const sb = getSupabase();
  try {
    const { messages } = await listMessages(50);
    const maxTs = messages.reduce((mx, m) => Math.max(mx, m.date), 0);

    // Read cursor. First run: bootstrap to newest so we don't answer historical backlog.
    const { data: state } = await sb.from("clickup_state").select("value").eq("key", STATE_KEY).maybeSingle();
    if (!state) {
      await sb.from("clickup_state").upsert({ key: STATE_KEY, value: String(maxTs), updated_at: new Date().toISOString() });
      return NextResponse.json({ ok: true, bootstrapped: true, cursor: maxTs });
    }
    const lastTs = Number(state.value ?? 0);
    const bot = botUserId();

    const fresh = messages
      .filter((m) => m.date > lastTs && TRIGGER.test(m.content) && (!bot || m.userId !== bot))
      .sort((a, b) => a.date - b.date); // answer oldest first

    let answered = 0;
    for (const m of fresh) {
      const q = m.content.replace(TRIGGER, "").trim();
      if (!q) continue;
      try {
        const ans = await answerQuestion(q);
        // Post to the channel (visible) rather than a hidden thread reply.
        await postMessage(`💬 **Re:** _${q}_\n\n${ans}`);
        answered++;
      } catch (e) {
        console.error("[cron/clickup-poll] answer failed:", e instanceof Error ? e.message : String(e));
      }
    }

    await sb.from("clickup_state").upsert({ key: STATE_KEY, value: String(Math.max(lastTs, maxTs)), updated_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, scanned: messages.length, answered });
  } catch (e) {
    console.error("[cron/clickup-poll] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
