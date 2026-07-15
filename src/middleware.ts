import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Cookie-based gate for the dashboard (it shows client revenue).
// - Enforced only when DASHBOARD_PASSWORD is set (so local dev / pre-config deploys aren't locked out).
// - Unauthenticated requests are redirected to the custom /login page.
// - The cron ingestion route is excluded via the matcher (it has its own CRON_SECRET).
export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await sessionToken(password);
  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except the cron API and Next internals/static assets.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
