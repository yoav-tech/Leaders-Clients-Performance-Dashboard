// Shared-password session token. Derived from DASHBOARD_PASSWORD via HMAC so the raw
// password is never stored in the cookie, and changing the password invalidates old
// sessions. Uses Web Crypto so it runs in both the edge middleware and Node routes.

export const SESSION_COOKIE = "dash_session";

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("leaders-dashboard-auth-v1"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
