// Stateless, signed invite tokens for onboarding a client user. A token binds an email + expiry,
// signed by DASHBOARD_PASSWORD (Web Crypto). No DB storage needed — the user row (created by the
// admin with a null password) is activated when the client sets their password via the token.
import { hmacHex, safeEqual } from "./auth";

export const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

// Token binds the user's id (the account the invite activates).
export async function issueInviteToken(userId: string, nowSec: number): Promise<string> {
  const exp = nowSec + INVITE_TTL_SECONDS;
  const payload = b64urlEncode(JSON.stringify({ u: userId, x: exp }));
  const sig = await hmacHex(secret(), "invite-v1:" + payload);
  return `${payload}.${sig}`;
}

export async function verifyInviteToken(token: string | undefined, nowSec: number): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await safeEqual(sig, await hmacHex(secret(), "invite-v1:" + payload)))) return null;
  try {
    const o = JSON.parse(b64urlDecode(payload)) as { u?: string; x?: number };
    if (!o?.u || typeof o.x !== "number" || o.x < nowSec) return null;
    return o.u;
  } catch {
    return null;
  }
}
