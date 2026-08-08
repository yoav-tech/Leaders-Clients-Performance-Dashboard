// Signed one-click "add to ClickUp" links for the digest email. The alert text is HMAC-signed so
// the public task-creation endpoint only acts on tasks the server itself issued.
import { hmacHex, safeEqual } from "./auth";

const secret = () => process.env.DASHBOARD_PASSWORD ?? "";
// UTF-8-safe base64url (alert text contains ₪, Hebrew, etc.).
const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
};

export async function signTask(name: string): Promise<string> {
  const payload = b64url(name);
  const sig = await hmacHex(secret(), "task:" + payload);
  return `${payload}.${sig}`;
}

export async function verifyTask(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await safeEqual(sig, await hmacHex(secret(), "task:" + payload)))) return null;
  try {
    return unb64url(payload);
  } catch {
    return null;
  }
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://leaders-clients-performance-dashboa.vercel.app";
}
