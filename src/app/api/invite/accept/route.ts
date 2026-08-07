import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { verifyInviteToken } from "@/lib/invite";
import { getUserById, activateUser, emailTakenByOther } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// POST { token, fullName, email, phone, password } → onboard an invited client: save their
// profile + password, activating the account. Public (excluded from middleware) but gated by the
// signed invite token, which binds the username.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  const limited = rateLimit(`invite:${clientIp(request)}`);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });

  const body = (await request.json().catch(() => ({}))) as { token?: string; fullName?: string; email?: string; phone?: string; password?: string };
  const userId = await verifyInviteToken(body.token, Math.floor(Date.now() / 1000));
  if (!userId) return NextResponse.json({ ok: false, error: "Invite link is invalid or expired." }, { status: 400 });
  if (!(await getUserById(userId))) return NextResponse.json({ ok: false, error: "This invite is no longer valid." }, { status: 400 });

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");

  if (fullName.length < 2) return NextResponse.json({ ok: false, error: "יש להזין שם מלא." }, { status: 400 });
  if (!emailOk(email)) return NextResponse.json({ ok: false, error: "מייל לא תקין." }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 7) return NextResponse.json({ ok: false, error: "מספר טלפון לא תקין." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: "הסיסמה חייבת לפחות 8 תווים." }, { status: 400 });
  if (await emailTakenByOther(email, userId)) return NextResponse.json({ ok: false, error: "המייל כבר בשימוש." }, { status: 400 });

  await activateUser(userId, { fullName, email, phone, passwordHash: await hashPassword(password) });
  return NextResponse.json({ ok: true });
}
