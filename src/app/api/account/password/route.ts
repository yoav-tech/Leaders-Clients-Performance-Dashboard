import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getUserById, setUserPassword } from "@/lib/users";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Self-service password change for a logged-in client user (identified by session.sub = email).
// The shared-password team admin (sub="team") has no DB row and changes its password via env.
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }
  const limited = rateLimit(`pwchange:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });
  }

  const session = await getServerSession();
  if (!session || !session.sub || session.sub === "admin") {
    return NextResponse.json({ ok: false, error: "Not available for this account." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { current?: string; next?: string };
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (next.length < 8) {
    return NextResponse.json({ ok: false, error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await getUserById(session.sub);
  if (!user || !user.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 401 });
  }

  await setUserPassword(user.id, await hashPassword(next));
  return NextResponse.json({ ok: true });
}
