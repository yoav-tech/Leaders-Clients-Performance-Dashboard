import { NextResponse } from "next/server";
import { SESSION_COOKIE, safeEqual, sameOrigin } from "@/lib/auth";
import { issueSession, type Role } from "@/lib/session";
import { getUserByIdentifier } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Login by username OR email + password.
//  - Team:   username "admin" + DASHBOARD_PASSWORD → admin session (all brands).
//  - Client: their username or email, matched in dashboard_users → session scoped to their brands.
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

  const body = (await request.json().catch(() => ({}))) as { identifier?: string; password?: string };
  const identifier = String(body.identifier ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const now = Math.floor(Date.now() / 1000);

  let session: { role: Role; sub: string; brands: string[] } | null = null;

  if (identifier === "admin") {
    // Team login → admin.
    if (adminPassword && (await safeEqual(password, adminPassword))) {
      session = { role: "admin", sub: "admin", brands: [] };
    }
  } else if (identifier) {
    // Client login by username or email.
    const user = await getUserByIdentifier(identifier);
    if (user && user.passwordHash && (await verifyPassword(password, user.passwordHash))) {
      session = { role: user.role, sub: user.id, brands: user.brandIds };
    }
  }

  if (!session) {
    return NextResponse.json({ ok: false, error: "Incorrect username/email or password" }, { status: 401 });
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
