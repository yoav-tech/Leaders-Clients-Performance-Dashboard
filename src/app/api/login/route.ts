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

  // Two callers: the JS form fetches JSON; a non-hydrated / pre-hydration native form submit
  // arrives as application/x-www-form-urlencoded. We accept both, and reply in kind — JSON
  // clients get {ok}, native form posts get a redirect (so login works even without JS).
  const contentType = request.headers.get("content-type") ?? "";
  const isForm = contentType.includes("form-urlencoded") || contentType.includes("multipart/form-data");
  let identifier = "";
  let password = "";
  if (isForm) {
    const form = await request.formData().catch(() => null);
    identifier = String(form?.get("identifier") ?? "").trim().toLowerCase();
    password = String(form?.get("password") ?? "");
  } else {
    const body = (await request.json().catch(() => ({}))) as { identifier?: string; password?: string };
    identifier = String(body.identifier ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  }
  const now = Math.floor(Date.now() / 1000);
  const nextParam = new URL(request.url).searchParams.get("next");
  const safeNext = nextParam && nextParam.startsWith("/") ? nextParam : "/";

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
    if (isForm) {
      const back = new URL("/login", request.url);
      if (safeNext !== "/") back.searchParams.set("next", safeNext);
      back.searchParams.set("error", "1");
      return NextResponse.redirect(back, { status: 303 });
    }
    return NextResponse.json({ ok: false, error: "Incorrect username/email or password" }, { status: 401 });
  }

  const issued = await issueSession(session, now);
  const res = isForm
    ? NextResponse.redirect(new URL(safeNext, request.url), { status: 303 })
    : NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, issued.value, {
    httpOnly: true,
    // Secure only in production — over http://localhost a Secure cookie is silently
    // dropped by the browser, which would bounce the user back to /login on every dev login.
    secure: process.env.NODE_ENV === "production",
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
  res.cookies.set(SESSION_COOKIE, "", { path: "/", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  return res;
}
