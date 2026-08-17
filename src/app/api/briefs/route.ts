import { NextResponse } from "next/server";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { getBrand } from "@/lib/brands";
import { listBriefs, upsertBrief, deleteBrief, type BriefStatus } from "@/lib/briefStore";

export const dynamic = "force-dynamic";

const isManager = (r?: string) => r === "admin" || r === "manager";

// GET /api/briefs?brand=  — list (any role with brand access; write = media managers).
export async function GET(request: Request) {
  const brand = getBrand(new URL(request.url).searchParams.get("brand") ?? "");
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  const session = await getServerSession();
  if (!canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ briefs: await listBriefs(brand.id), canEdit: isManager(session?.role) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST — create/edit a brief (media managers only).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!isManager(session?.role)) return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const brand = getBrand(String(b.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const brief = await upsertBrief({
      id: b.id ? String(b.id) : undefined,
      brandId: brand.id,
      title: String(b.title ?? "").slice(0, 300),
      objective: String(b.objective ?? "").slice(0, 3000),
      audience: String(b.audience ?? "").slice(0, 2000),
      keyMessage: String(b.keyMessage ?? "").slice(0, 2000),
      channels: Array.isArray(b.channels) ? b.channels.map((c: unknown) => String(c)).slice(0, 12) : [],
      budget: b.budget == null || b.budget === "" ? null : Number(b.budget),
      startDate: b.startDate ? String(b.startDate) : null,
      endDate: b.endDate ? String(b.endDate) : null,
      status: (["draft", "active", "done"].includes(String(b.status)) ? b.status : "draft") as BriefStatus,
      notes: String(b.notes ?? "").slice(0, 5000),
      createdBy: session?.sub ?? null,
    });
    return NextResponse.json({ ok: true, brief });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/briefs?id=&brand=  — media managers only.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!isManager(session?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const id = url.searchParams.get("id") ?? "";
  if (!brand || !canAccessBrand(session, brand.id) || !id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await deleteBrief(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
