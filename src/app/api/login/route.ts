import { NextResponse } from "next/server";
import { SESSION_COOKIE, issueSession, safeEqual, sameOrigin } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const password = process.env.DASHBOARD_PASSWORD;

  // CSRF: only accept credential submissions from our own origin.
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }

  // Throttle brute-force attempts per IP.
  const limited = rateLimit(`login:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };

  if (!password || !(await safeEqual(String(body.password ?? ""), password))) {
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  // Issue a fresh, expiring token on every successful login (rotation + anti-fixation).
  const now = Math.floor(Date.now() / 1000);
  const session = await issueSession(password, now);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return res;
}

// Logout: clear the session cookie. Same-origin only.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  // __Host- cookies require Secure + Path=/ to be cleared.
  res.cookies.set(SESSION_COOKIE, "", { path: "/", secure: true, maxAge: 0 });
  return res;
}
