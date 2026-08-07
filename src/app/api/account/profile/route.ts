import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getUserById, updateProfile, usernameTakenByOther, emailTakenByOther, RESERVED_USERNAMES, normUsername } from "@/lib/users";

export const dynamic = "force-dynamic";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const usernameOk = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u) && !RESERVED_USERNAMES.has(u);

// PATCH { username, email, fullName, phone } → the logged-in user edits their own profile.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!session || session.sub === "admin") return NextResponse.json({ ok: false, error: "לא זמין לחשבון זה." }, { status: 400 });
  const me = await getUserById(session.sub);
  if (!me) return NextResponse.json({ ok: false, error: "משתמש לא נמצא." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { username?: string; email?: string; fullName?: string; phone?: string };
  const username = normUsername(String(body.username ?? ""));
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  if (!usernameOk(username)) return NextResponse.json({ ok: false, error: "שם משתמש לא תקין (3–30, אותיות/ספרות/._- ולא 'admin')." }, { status: 400 });
  if (!emailOk(email)) return NextResponse.json({ ok: false, error: "מייל לא תקין." }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ ok: false, error: "יש להזין שם מלא." }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 7) return NextResponse.json({ ok: false, error: "טלפון לא תקין." }, { status: 400 });
  if (await usernameTakenByOther(username, me.id)) return NextResponse.json({ ok: false, error: "שם המשתמש כבר תפוס." }, { status: 400 });
  if (await emailTakenByOther(email, me.id)) return NextResponse.json({ ok: false, error: "המייל כבר בשימוש." }, { status: 400 });

  await updateProfile(me.id, { username, email, fullName, phone });
  return NextResponse.json({ ok: true });
}
