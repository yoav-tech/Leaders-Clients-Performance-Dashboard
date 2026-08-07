import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getBrand } from "@/lib/brands";
import { listUsers, createInvitedUser, updateUserBrands, deleteUser, getUserByEmail } from "@/lib/users";
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
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// GET → list users (admin only)
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ users: await listUsers() });
}

// POST { email, brandIds, role? } → create an invited client + return a shareable invite link.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; brandIds?: unknown; role?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "admin" ? "admin" : "client";
  const brandIds = cleanBrands(body.brandIds);
  if (!emailOk(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  if (role === "client" && brandIds.length === 0) return NextResponse.json({ error: "Pick at least one brand" }, { status: 400 });

  await createInvitedUser(email, role, brandIds);
  const token = await issueInviteToken(email, Math.floor(Date.now() / 1000));
  const origin = new URL(request.url).origin;
  return NextResponse.json({ ok: true, inviteUrl: `${origin}/invite?token=${token}` });
}

// PATCH { email, brandIds, role } → update an existing user's access.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; brandIds?: unknown; role?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "admin" ? "admin" : "client";
  const brandIds = cleanBrands(body.brandIds);
  if (!email || !(await getUserByEmail(email))) return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  if (role === "client" && brandIds.length === 0) return NextResponse.json({ error: "Pick at least one brand" }, { status: 400 });

  await updateUserBrands(email, role, brandIds);
  return NextResponse.json({ ok: true });
}

// DELETE ?email= → remove a user.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "missing email" }, { status: 400 });
  await deleteUser(email);
  return NextResponse.json({ ok: true });
}
