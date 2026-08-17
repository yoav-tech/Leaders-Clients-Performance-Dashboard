// HMAC sign/verify for content-asset Storage paths — the trust tie between the item list (which
// issues signed URLs, brand-gated) and /api/content-asset (which streams the file same-origin).
// Same shape as creativeSign.ts, keyed on the storage path instead of a remote URL.
import { hmacHex, safeEqual } from "./auth";

export async function assetSig(path: string): Promise<string> {
  return hmacHex(process.env.DASHBOARD_PASSWORD ?? "", "content-asset:" + path);
}

export async function signedAssetPath(path: string): Promise<string> {
  return `/api/content-asset?path=${encodeURIComponent(path)}&sig=${await assetSig(path)}`;
}

export async function verifyAssetSig(path: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  return safeEqual(sig, await assetSig(path));
}
