import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getCreatives, type CreativeMap } from "@/lib/creatives";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { signedCreativePath } from "@/lib/creativeSign";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // creative-field Windsor queries are slow (~110s for Meta); Pro allows up to 300. Windsor caches 15 min, so only the first load per range is slow.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/creatives?brand=&channel=meta|tiktok&from=&to=  (auth-gated by middleware)
// Returns { creatives: { [adName]: { platform, thumb, video } } } where thumb/video are already
// signed first-party /api/creative-proxy paths (the client uses them directly).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const channel = url.searchParams.get("channel");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!brand || (channel !== "meta" && channel !== "tiktok") || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "bad params", creatives: {} }, { status: 400 });
  }
  if (!canAccessBrand(await getServerSession(), brand.id)) {
    return NextResponse.json({ error: "forbidden", creatives: {} }, { status: 403 });
  }
  try {
    const raw = await getCreatives(brand, channel, from, to);
    const creatives: CreativeMap = {};
    for (const [name, c] of Object.entries(raw)) {
      creatives[name] = {
        platform: c.platform,
        thumb: c.thumb ? await signedCreativePath(c.thumb) : null,
        video: c.video ? await signedCreativePath(c.video) : null,
      };
    }
    return NextResponse.json({ creatives });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), creatives: {} }, { status: 500 });
  }
}
