import { NextResponse } from "next/server";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { getBrand } from "@/lib/brands";
import { getSupabase, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/content/upload  (multipart: file + brand) — media managers only. Uploads a content
// asset into the private `content-assets` bucket (same Supabase project) and returns its path.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ error: "storage not configured" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const brand = getBrand(String(form?.get("brand") ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });

  const type = file.type || "application/octet-stream";
  if (!/^(image|video)\//i.test(type)) return NextResponse.json({ error: "רק תמונה או וידאו" }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "קובץ גדול מדי (מקס׳ 50MB)" }, { status: 413 });

  const safeName = (file.name || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${brand.id}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await getSupabase().storage.from("content-assets").upload(path, bytes, { contentType: type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, path, kind: /^video\//i.test(type) ? "video" : "image" });
}
