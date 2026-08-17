import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { listUsers } from "@/lib/users";
import { BRANDS } from "@/lib/brands";
import { isOwner } from "@/lib/automations";
import AppShell from "@/components/AppShell";
import AdminUsers from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect("/");

  const owner = await isOwner(session);
  const users = await listUsers();
  const brands = BRANDS.map((b) => ({ id: b.id, name: b.name }));

  return (
    <AppShell
      allowed={allowedBrands(session)}
      activeBrand=""
      activeSection="admin"
      isAdmin
      rangeQuery=""
      accountLabel="מנהל מדיה"
      accountSub="Admin"
      topBar={<div className="pr-10 lg:pr-0"><h1 className="text-base font-bold">ניהול הרשאות</h1><p className="text-[11px] text-[var(--muted)]">יצירת גישה ללקוחות והזמנתם</p></div>}
    >
      {owner && (
        <Link href="/admin/automations" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm hover:border-[var(--muted)]" dir="rtl">
          <span className="text-[var(--foreground)]"><b>אוטומציות</b> · שליטה בתהליכים המתוזמנים (מנהל-על)</span>
          <span className="text-[var(--muted)]">←</span>
        </Link>
      )}
      <AdminUsers initialUsers={users} brands={brands} />
    </AppShell>
  );
}
