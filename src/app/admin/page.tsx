import { redirect } from "next/navigation";
import { BRANDS } from "@/lib/brands";
import { getServerSession } from "@/lib/serverSession";
import { listUsers } from "@/lib/users";
import LeadersLogo from "@/components/LeadersLogo";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import AdminUsers from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect("/");

  const users = await listUsers();
  const brands = BRANDS.map((b) => ({ id: b.id, name: b.name }));

  return (
    <main className="dash-aura mx-auto max-w-4xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LeadersLogo height={34} />
          <div className="border-l border-[var(--card-border)] pl-3">
            <h1 className="text-lg font-bold">ניהול הרשאות</h1>
            <p className="text-xs text-[var(--muted)]">יצירת גישה ללקוחות והזמנתם</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="rounded-md border border-[var(--card-border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">← לדשבורד</a>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <div className="mt-6">
        <AdminUsers initialUsers={users} brands={brands} />
      </div>
    </main>
  );
}
