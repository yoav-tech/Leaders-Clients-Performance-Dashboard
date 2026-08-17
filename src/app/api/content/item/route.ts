import { NextResponse } from "next/server";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { getBrand } from "@/lib/brands";
import { upsertItem, getItem, setItemStatus, deleteItem, type ContentPlatform, type ContentStatus } from "@/lib/contentStore";
import { notifyReadyForApproval, notifyDecision } from "@/lib/contentNotify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORMS = ["instagram", "facebook", "linkedin"];
const isManager = (r?: string) => r === "admin" || r === "manager";
const isApprover = (r?: string) => r === "admin" || r === "client";

// POST — create/edit a content item (media managers only).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!isManager(session?.role)) return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const brand = getBrand(String(b.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? ""))) return NextResponse.json({ error: "bad date" }, { status: 400 });
  if (!PLATFORMS.includes(String(b.platform))) return NextResponse.json({ error: "bad platform" }, { status: 400 });
  try {
    const item = await upsertItem({
      id: b.id ? String(b.id) : undefined,
      brandId: brand.id,
      date: String(b.date),
      platform: String(b.platform) as ContentPlatform,
      title: String(b.title ?? "").slice(0, 300),
      body: String(b.body ?? "").slice(0, 5000),
      assetPath: b.assetPath ? String(b.assetPath) : null,
      assetKind: (["image", "video", "link"].includes(String(b.assetKind)) ? b.assetKind : "link"),
      briefId: b.briefId ? String(b.briefId) : null,
      createdBy: session?.sub ?? null,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// PATCH — status transitions. Manager: draft/pending/scheduled/published. Client (CEO): approved /
// changes_requested (+ feedback). Manager cannot self-approve; client cannot edit content.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? "");
  const status = String(b.status ?? "") as ContentStatus;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const item = await getItem(id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const brand = getBrand(item.brandId);
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const approvalStatuses: ContentStatus[] = ["approved", "changes_requested"];
  const managerStatuses: ContentStatus[] = ["draft", "pending", "scheduled", "published"];

  try {
    if (approvalStatuses.includes(status)) {
      if (!isApprover(session?.role)) return NextResponse.json({ error: "forbidden — client approval only" }, { status: 403 });
      const feedback = String(b.feedback ?? "").slice(0, 2000);
      await setItemStatus(id, status, session?.sub ?? "client", feedback);
      const sentTo = await notifyDecision(brand, item.title || "פריט תוכן", status as "approved" | "changes_requested", feedback);
      return NextResponse.json({ ok: true, sentTo });
    }
    if (managerStatuses.includes(status)) {
      if (!isManager(session?.role)) return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
      await setItemStatus(id, status, session?.sub ?? "manager");
      const sentTo = status === "pending" ? await notifyReadyForApproval(brand, `הפריט "${item.title || "ללא כותרת"}"`) : [];
      return NextResponse.json({ ok: true, sentTo });
    }
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/content/item?id=  — media managers only.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!isManager(session?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const item = id ? await getItem(id) : null;
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canAccessBrand(session, item.brandId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await deleteItem(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
