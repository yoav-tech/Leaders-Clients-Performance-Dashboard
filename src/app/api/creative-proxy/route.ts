import { NextResponse } from "next/server";
import { verifyCreativeSig } from "@/lib/creativeSign";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// First-party media proxy for ad creatives. The dashboard CSP is locked to 'self', and
// Meta/TikTok creative URLs are signed, expiring, and sometimes http:// — so instead of
// loosening the CSP to external CDNs, we fetch the asset server-side and re-serve it same-origin.
//
// SSRF guard: only these creative CDNs are allowed. No internal hosts, no arbitrary URLs.
const ALLOWED_HOST_SUFFIXES = [
  ".fbcdn.net",
  ".cdninstagram.com",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".ttwstatic.com",
  ".ibyteimg.com",
  ".byteoversea.com",
];

function hostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => h.endsWith(s));
}

// GET /api/creative-proxy?u=<creative url>&sig=<hmac>  (auth-gated by middleware)
// The signature ties each URL to one the server issued via /api/creatives (which is brand-guarded),
// so a logged-in client can't proxy an arbitrary — or another client's — creative URL.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const u = params.get("u");
  if (!u) return NextResponse.json({ error: "missing u" }, { status: 400 });
  if (!(await verifyCreativeSig(u, params.get("sig")))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 });
  }
  if (!hostAllowed(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { Accept: "image/*,video/*,*/*" },
      redirect: "follow",
      next: { revalidate: 3600 }, // let the platform cache the fetch for an hour
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    // Only serve media types — never let this become a general fetcher for html/json.
    if (!/^(image|video|audio)\//i.test(contentType)) {
      return NextResponse.json({ error: "not media" }, { status: 415 });
    }
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400", // creatives are stable for a day; private (session-gated)
      "X-Content-Type-Options": "nosniff",
    });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
