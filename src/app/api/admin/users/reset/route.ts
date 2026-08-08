import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { sameOrigin } from "@/lib/auth";
import { getServerSession } from "@/lib/serverSession";
import { getUserById, setUserPassword } from "@/lib/users";
import { hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

const genPassword = () => randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 14);

// POST { id } → admin resets a user's password to a fresh temporary one, returned once to share.
// The user can then change it themselves via /account. Admin-only.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const id = String(((await request.json().catch(() => ({}))) as { id?: string }).id ?? "");
  const user = id ? await getUserById(id) : null;
  if (!user) return NextResponse.json({ error: "unknown user" }, { status: 404 });

  const password = genPassword();
  await setUserPassword(user.id, await hashPassword(password));
  return NextResponse.json({ ok: true, username: user.username, password });
}
