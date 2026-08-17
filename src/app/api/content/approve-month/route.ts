import { NextResponse } from "next/server";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { getBrand } from "@/lib/brands";
import { setMonthStatus, type MonthStatus } from "@/lib/contentStore";
import { notifyReadyForApproval, notifyDecision } from "@/lib/contentNotify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isManager = (r?: string) => r === "admin" || r === "manager";
const isApprover = (r?: string) => r === "admin" || r === "client";

// POST { brand, month, status, note? } — monthly sign-off. Manager sets `pending` (→ emails the
// CEO); the CEO sets `approved` (→ emails the managers). `draft` reopens it (manager).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  const b = await request.json().catch(() => ({}));
  const brand = getBrand(String(b.brand ?? ""));
  const month = String(b.month ?? "");
  const status = String(b.status ?? "") as MonthStatus;
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "bad month" }, { status: 400 });

  try {
    if (status === "approved") {
      if (!isApprover(session?.role)) return NextResponse.json({ error: "forbidden — client approval only" }, { status: 403 });
      await setMonthStatus(brand.id, month, "approved", session?.sub ?? "client", String(b.note ?? "").slice(0, 2000));
      const sentTo = await notifyDecision(brand, `תוכנית ${month}`, "approved", "");
      return NextResponse.json({ ok: true, sentTo });
    }
    if (status === "pending" || status === "draft") {
      if (!isManager(session?.role)) return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
      await setMonthStatus(brand.id, month, status, session?.sub ?? "manager");
      const sentTo = status === "pending" ? await notifyReadyForApproval(brand, `תוכנית התוכן לחודש ${month}`) : [];
      return NextResponse.json({ ok: true, sentTo });
    }
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
