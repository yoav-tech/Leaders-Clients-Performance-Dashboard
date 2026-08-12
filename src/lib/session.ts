// Identity-bearing session cookie (v3). Extends the existing HMAC-cookie scheme to carry the
// user's role + allowed brands, so per-client authorization is stateless (no DB hit per request)
// and edge-friendly (Web Crypto only — safe to import from middleware).
//
// Token: "<b64url(payload)>.<hmac(DASHBOARD_PASSWORD, 'sess-v3:'+payload)>"
// payload = { r: role, s: subject(email), b: brandIds[], e: expiry }.
// Changing DASHBOARD_PASSWORD or a user's brands (→ re-login) invalidates old tokens.

import { hmacHex, safeEqual } from "./auth";

// admin   — the Leaders team's shared login; sees every brand and the management consoles.
// manager — a Leaders-side brand manager, scoped to brand_ids. Sees the full (non-trimmed)
//           dashboard for those brands, and is who a monthly media plan is emailed to.
// client  — the client themselves, scoped to brand_ids, on the trimmed client view.
export type Role = "admin" | "manager" | "client";
export const ROLES: Role[] = ["admin", "manager", "client"];
export const asRole = (v: unknown): Role => (v === "admin" ? "admin" : v === "manager" ? "manager" : "client");
export interface Session {
  role: Role;
  sub: string; // subject: email for clients, "team" for the shared-password admin
  brands: string[]; // scoped brand ids (ignored for admin — admin sees all)
  exp: number;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function secret(): string {
  const p = process.env.DASHBOARD_PASSWORD;
  if (!p) throw new Error("DASHBOARD_PASSWORD not set");
  return p;
}

export async function issueSession(
  s: { role: Role; sub: string; brands: string[] },
  nowSec: number,
): Promise<{ value: string; maxAge: number }> {
  const exp = nowSec + SESSION_TTL_SECONDS;
  const payload = b64urlEncode(JSON.stringify({ r: s.role, s: s.sub, b: s.brands, e: exp }));
  const sig = await hmacHex(secret(), "sess-v3:" + payload);
  return { value: `${payload}.${sig}`, maxAge: SESSION_TTL_SECONDS };
}

export async function readSession(value: string | undefined, nowSec: number): Promise<Session | null> {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = await hmacHex(secret(), "sess-v3:" + payload);
  if (!(await safeEqual(sig, expected))) return null;
  try {
    const o = JSON.parse(b64urlDecode(payload)) as { r?: string; s?: string; b?: unknown; e?: number };
    if (!o || typeof o.e !== "number" || o.e < nowSec) return null;
    return {
      role: asRole(o.r),
      sub: String(o.s ?? ""),
      brands: Array.isArray(o.b) ? o.b.map(String) : [],
      exp: o.e,
    };
  } catch {
    return null;
  }
}

export function canAccessBrand(session: Session | null, brandId: string): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  return session.brands.includes(brandId);
}
