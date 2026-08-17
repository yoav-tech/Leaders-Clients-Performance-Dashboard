import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { isOwner, automationByKey, setAutomationEnabled } from "@/lib/automations";

export const dynamic = "force-dynamic";

// POST { key, enabled } — enable/disable a scheduled automation. Super-admin (owner) only.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!(await isOwner(session))) return NextResponse.json({ error: "forbidden — owner only" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const key = String(b.key ?? "");
  if (!automationByKey(key)) return NextResponse.json({ error: "unknown automation" }, { status: 400 });
  try {
    await setAutomationEnabled(key, !!b.enabled);
    return NextResponse.json({ ok: true, key, enabled: !!b.enabled });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
