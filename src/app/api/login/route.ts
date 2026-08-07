import { NextResponse } from "next/server";
import { SESSION_COOKIE, safeEqual, sameOrigin } from "@/lib/auth";
import { issueSession } from "@/lib/session";
import { getUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Two login modes:
//  - Client: { email, password } → looked up in dashboard_users; session scoped to their brands.
//  - Team:   { password } matching DASHBOARD_PASSWORD → admin session (all brands).
export async function POST(request: Request) {
  const adminPassword = process.env.DASHBOARD_PASSWORD;

  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }

  const limited = rateLimit(`login:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const now = Math.floor(Date.now() / 1000);

  let session: { role: "admin" | "client"; sub: string; brands: string[] } | null = null;

  if (email) {
    // Client (or DB-defined admin) login.
    const user = await getUserByEmail(email);
    if (user && user.passwordHash && (await verifyPassword(password, user.passwordHash))) {
      session = { role: user.role, sub: user.email, brands: user.brandIds };
    }
  } else if (adminPassword && (await safeEqual(password, adminPassword))) {
    // Team shared-password login → admin.
    session = { role: "admin", sub: "team", brands: [] };
  }

  if (!session) {
    return NextResponse.json({ ok: false, error: "Incorrect email or password" }, { status: 401 });
  }

  const issued = await issueSession(session, now);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, issued.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: issued.maxAge,
  });
  return res;
}

// Logout: clear the session cookie. Same-origin only.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", secure: true, maxAge: 0 });
  return res;
}
