import { redirect } from "next/navigation";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { AUTOMATIONS, enabledMap, isOwner } from "@/lib/automations";
import AppShell from "@/components/AppShell";
import AutomationsConsole from "@/components/AutomationsConsole";

export const dynamic = "force-dynamic";

// Super-admin (owner) only. Gal's shared "admin" login is not an owner → redirected.
export default async function AutomationsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/admin/automations");
  if (!(await isOwner(session))) redirect("/admin");

  const enabled = await enabledMap();
  const rows = AUTOMATIONS.map((a) => ({ key: a.key, name: a.name, scheduleHe: a.scheduleHe, description: a.description, enabled: enabled[a.key] !== false }));

  return (
    <AppShell
      allowed={allowedBrands(session)}
      activeBrand=""
      activeSection="admin"
      isAdmin
      rangeQuery=""
      accountLabel="מנהל-על"
      accountSub="Owner"
      topBar={<div className="pr-10 lg:pr-0"><h1 className="text-base font-bold">אוטומציות</h1><p className="text-[11px] text-[var(--muted)]">שליטה בתהליכים המתוזמנים של המערכת</p></div>}
    >
      <AutomationsConsole initial={rows} />
    </AppShell>
  );
}
