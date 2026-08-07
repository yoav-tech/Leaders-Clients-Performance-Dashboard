import { redirect } from "next/navigation";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { getUserById, listTeam, MAX_TEAM } from "@/lib/users";
import AppShell from "@/components/AppShell";
import AccountPanel from "@/components/AccountPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/account");

  const isAdmin = session.role === "admin";
  const me = isAdmin ? null : await getUserById(session.sub);
  const isPrimary = !!me && !me.invitedBy;
  const team = isPrimary ? await listTeam(me!.id) : [];

  const accountLabel = isAdmin ? "מנהל מדיה" : me?.fullName || me?.username || "לקוח";
  const accountSub = isAdmin ? "Admin" : me?.username ?? "";

  return (
    <AppShell
      allowed={allowedBrands(session)}
      activeBrand=""
      activeSection="account"
      isAdmin={isAdmin}
      rangeQuery=""
      accountLabel={accountLabel}
      accountSub={accountSub}
      topBar={<div className="pr-10 lg:pr-0"><h1 className="text-base font-bold">החשבון שלי</h1></div>}
    >
      <AccountPanel
        isAdmin={isAdmin}
        profile={me ? { username: me.username, email: me.email ?? "", fullName: me.fullName ?? "", phone: me.phone ?? "" } : null}
        isPrimary={isPrimary}
        team={team.map((t) => ({ id: t.id, username: t.username, fullName: t.fullName, pending: t.pending }))}
        maxTeam={MAX_TEAM}
      />
    </AppShell>
  );
}
