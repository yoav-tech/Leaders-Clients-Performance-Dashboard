import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getBrand } from "@/lib/brands";
import { listUsers, createInvitedUser, updateUserBrands, deleteUser, getUserByUsername, RESERVED_USERNAMES, normUsername } from "@/lib/users";
import { issueInviteToken } from "@/lib/invite";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const s = await getServerSession();
  return s?.role === "admin" ? s : null;
}
function cleanBrands(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((b) => String(b).trim()).filter((b) => getBrand(b)))];
}
// Usernames: 3–30 chars, letters/digits/._- , not reserved.
const usernameOk = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u) && !RESERVED_USERNAMES.has(u);

// GET → list users (admin only)
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ users: await listUsers() });
}

// POST { username, brandIds, role? } → create an invited client + return a shareable invite link.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { username?: string; brandIds?: unknown; role?: string };
  const username = normUsername(String(body.username ?? ""));
  const role = body.role === "admin" ? "admin" : "client";
  const brandIds = cleanBrands(body.brandIds);
  if (!usernameOk(username)) return NextResponse.json({ error: "שם משתמש לא תקין (3–30 תווים, אותיות/ספרות/._- ולא 'admin')" }, { status: 400 });
  if (role === "client" && brandIds.length === 0) return NextResponse.json({ error: "בחר לפחות מותג אחד" }, { status: 400 });

  await createInvitedUser(username, role, brandIds);
  const token = await issueInviteToken(username, Math.floor(Date.now() / 1000));
  const origin = new URL(request.url).origin;
  return NextResponse.json({ ok: true, username, inviteUrl: `${origin}/invite?token=${token}` });
}

// PATCH { username, brandIds, role } → update an existing user's access.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { username?: string; brandIds?: unknown; role?: string };
  const username = normUsername(String(body.username ?? ""));
  const role = body.role === "admin" ? "admin" : "client";
  const brandIds = cleanBrands(body.brandIds);
  if (!username || !(await getUserByUsername(username))) return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  if (role === "client" && brandIds.length === 0) return NextResponse.json({ error: "בחר לפחות מותג אחד" }, { status: 400 });

  await updateUserBrands(username, role, brandIds);
  return NextResponse.json({ ok: true });
}

// DELETE ?username= → remove a user.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const username = normUsername(new URL(request.url).searchParams.get("username") ?? "");
  if (!username) return NextResponse.json({ error: "missing username" }, { status: 400 });
  await deleteUser(username);
  return NextResponse.json({ ok: true });
}
