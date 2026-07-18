// Shared-password session token. Derived from DASHBOARD_PASSWORD via HMAC so the raw
// password is never stored in the cookie, and changing the password invalidates old
// sessions. Uses Web Crypto so it runs in both the edge middleware and Node routes.

// __Host- prefix: browser-enforced hardening — requires Secure, Path=/, and forbids a
// Domain attribute, closing subdomain cookie-injection/theft gaps that Secure+HttpOnly alone
// don't. (localhost is treated as a secure context, so this still works in dev.)
export const SESSION_COOKIE = "__Host-dash_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Constant-time string comparison (compares fixed-length SHA-256 digests) to avoid
// leaking the password via response-timing differences.
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function hmacHex(password: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Issue a session token bound to an expiry: "<exp>.<hmac(password, 'v2:'+exp)>". Each login
// mints a fresh token (new exp → new value), so tokens rotate on login and expire — closing
// the "static, never-expiring bearer" and session-fixation gaps.
export async function issueSession(
  password: string,
  nowSec: number,
): Promise<{ value: string; maxAge: number }> {
  const exp = nowSec + SESSION_TTL_SECONDS;
  const sig = await hmacHex(password, "leaders-dashboard-auth-v2:" + exp);
  return { value: `${exp}.${sig}`, maxAge: SESSION_TTL_SECONDS };
}

// Valid iff the signature matches AND the token hasn't expired.
export async function verifySession(
  value: string | undefined,
  password: string,
  nowSec: number,
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < nowSec) return false;
  const expected = await hmacHex(password, "leaders-dashboard-auth-v2:" + exp);
  return safeEqual(sig, expected);
}

// CSRF defense-in-depth: state-changing requests must originate from our own site. Checks the
// Origin header (falls back to Referer), matched against the request Host. Rejects when neither
// is present — machine callers (cron) use a bearer-secret path instead, not this.
export function sameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  const origin = request.headers.get("origin");
  const source = origin ?? request.headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}
