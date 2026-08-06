// Signs ad-creative URLs so /api/creative-proxy only serves URLs the server itself issued
// (from the brand-guarded /api/creatives). Prevents a logged-in client from proxying an
// arbitrary — or another client's — creative URL. HMAC keyed by DASHBOARD_PASSWORD (Web Crypto).
import { hmacHex, safeEqual } from "./auth";

export async function creativeSig(u: string): Promise<string> {
  return hmacHex(process.env.DASHBOARD_PASSWORD ?? "", "creative:" + u);
}

// Full first-party path the client can use directly as <img>/<video> src.
export async function signedCreativePath(u: string): Promise<string> {
  const sig = await creativeSig(u);
  return `/api/creative-proxy?u=${encodeURIComponent(u)}&sig=${sig}`;
}

export async function verifyCreativeSig(u: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  return safeEqual(sig, await creativeSig(u));
}
