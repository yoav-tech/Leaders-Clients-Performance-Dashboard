import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getUserById, listTeam, countTeam, createInvitedUser, deleteUser, RESERVED_USERNAMES, normUsername, MAX_TEAM } from "@/lib/users";
import { issueInviteToken } from "@/lib/invite";

export const dynamic = "force-dynamic";

const usernameOk = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u) && !RESERVED_USERNAMES.has(u);

// Only a primary client (role=client, invited_by IS NULL) may manage a team of up to MAX_TEAM.
async function primary() {
  const session = await getServerSession();
  if (!session || session.role !== "client") return null;
  const me = await getUserById(session.sub);
  if (!me || me.invitedBy) return null; // team members can't invite further
  return me;
}

// GET → { team, remaining }
export async function GET() {
  const me = await primary();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const team = await listTeam(me.id);
  return NextResponse.json({ team, remaining: Math.max(0, MAX_TEAM - team.length) });
}

// POST { username } → invite a team member (shares the primary's brands). Returns an invite link.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const me = await primary();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if ((await countTeam(me.id)) >= MAX_TEAM) return NextResponse.json({ error: `אפשר להזמין עד ${MAX_TEAM} אנשי צוות.` }, { status: 400 });

  const username = normUsername(String(((await request.json().catch(() => ({}))) as { username?: string }).username ?? ""));
  if (!usernameOk(username)) return NextResponse.json({ error: "שם משתמש לא תקין." }, { status: 400 });

  const id = await createInvitedUser(username, "client", me.brandIds, me.id);
  if (!id) return NextResponse.json({ error: "שם המשתמש כבר תפוס או שהיצירה נכשלה." }, { status: 400 });
  const token = await issueInviteToken(id, Math.floor(Date.now() / 1000));
  return NextResponse.json({ ok: true, inviteUrl: `${new URL(request.url).origin}/invite?token=${token}` });
}

// DELETE ?id= → remove one of my team members.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const me = await primary();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const target = id ? await getUserById(id) : null;
  if (!target || target.invitedBy !== me.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
