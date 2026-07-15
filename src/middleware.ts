import { NextRequest, NextResponse } from "next/server";

// Shared-password gate for the dashboard (it shows client revenue).
// - Enforced only when DASHBOARD_PASSWORD is set (so local dev / pre-config deploys aren't locked out).
// - Uses HTTP Basic Auth (native browser prompt); DASHBOARD_USER is optional.
// - The cron ingestion route is excluded here — it has its own CRON_SECRET.
export function middleware(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return NextResponse.next();

  const user = process.env.DASHBOARD_USER; // optional
  const auth = req.headers.get("authorization");

  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const sep = decoded.indexOf(":");
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if ((!user || u === user) && p === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Leaders Dashboard", charset="UTF-8"' },
  });
}

export const config = {
  // Run on everything except the cron API and Next internals/static assets.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
