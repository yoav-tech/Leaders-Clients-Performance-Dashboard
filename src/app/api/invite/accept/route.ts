import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { verifyInviteToken } from "@/lib/invite";
import { getUserByEmail, setUserPassword } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// POST { token, password } → activate an invited user by setting their password. Public
// (excluded from the auth middleware) but gated by the signed invite token.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  const limited = rateLimit(`invite:${clientIp(request)}`);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });

  const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const email = await verifyInviteToken(body.token, Math.floor(Date.now() / 1000));
  if (!email) return NextResponse.json({ ok: false, error: "Invite link is invalid or expired." }, { status: 400 });

  const password = String(body.password ?? "");
  if (password.length < 8) return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });

  // The user row must still exist (admin may have removed the invite).
  if (!(await getUserByEmail(email))) return NextResponse.json({ ok: false, error: "This invite is no longer valid." }, { status: 400 });

  await setUserPassword(email, await hashPassword(password));
  return NextResponse.json({ ok: true, email });
}
