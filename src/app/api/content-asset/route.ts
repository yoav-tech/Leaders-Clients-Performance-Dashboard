import { NextResponse } from "next/server";
import { verifyAssetSig } from "@/lib/contentAssetSign";
import { getSupabase, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/content-asset?path=<bucket path>&sig=<hmac>  (auth-gated by middleware)
// Streams a content asset from the private bucket SAME-ORIGIN, so the strict CSP (img/media-src
// 'self') is untouched. The signature ties each path to one the server issued in the item list.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const path = params.get("path");
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });
  if (!(await verifyAssetSig(path, params.get("sig")))) return NextResponse.json({ error: "bad signature" }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ error: "storage not configured" }, { status: 400 });

  const { data, error } = await getSupabase().storage.from("content-assets").download(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });

  const contentType = data.type || "application/octet-stream";
  // Only ever serve media — never let this become a general file fetcher.
  if (!/^(image|video|audio)\//i.test(contentType)) return NextResponse.json({ error: "not media" }, { status: 415 });

  return new Response(data.stream(), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
