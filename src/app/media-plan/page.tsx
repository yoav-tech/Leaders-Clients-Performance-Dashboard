import { redirect } from "next/navigation";
import { getServerSession, allowedBrands } from "@/lib/serverSession";
import { BRANDS } from "@/lib/brands";
import { brandManagersByBrand } from "@/lib/recipients";
import { listPlans } from "@/lib/mediaPlanStore";
import { nextMonthOf, prevMonthOf } from "@/lib/mediaPlanBuilder";
import { AUTOMATION, RULES_VERSION } from "@/lib/mediaPlanRules";
import { today } from "@/lib/dates";
import AppShell from "@/components/AppShell";
import MediaPlanBoard from "@/components/MediaPlanBoard";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Media managers' review + approval console for the monthly plans. Admin only — a plan is
// internal until it is approved here and mailed to the client's account manager.
export default async function MediaPlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/media-plan");
  if (session.role !== "admin") redirect("/");

  const sp = await searchParams;
  const thisMonth = today().slice(0, 7);
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : nextMonthOf(today());
  const months = [prevMonthOf(thisMonth), thisMonth, nextMonthOf(thisMonth)];

  const [plans, managers] = await Promise.all([
    listPlans(month).catch(() => []),
    brandManagersByBrand(BRANDS.map((b) => b.id)).catch(() => ({}) as Record<string, string[]>),
  ]);
  const brands = BRANDS.map((b) => ({ id: b.id, name: b.name, managers: managers[b.id] ?? [] }));

  return (
    <AppShell
      allowed={allowedBrands(session)}
      activeBrand=""
      activeSection="media-plan"
      isAdmin
      rangeQuery=""
      accountLabel="מנהל מדיה"
      accountSub="Admin"
      topBar={
        <div className="pr-10 lg:pr-0">
          <h1 className="text-base font-bold">פריסות מדיה</h1>
          <p className="text-[11px] text-[var(--muted)]">
            {AUTOMATION.enabled ? `נבנות אוטומטית ב-${AUTOMATION.buildDayOfMonth} לחודש` : "בנייה ידנית"} · נשלחות ללקוח רק לאחר אישור
          </p>
        </div>
      }
    >
      {!AUTOMATION.enabled && (
        <div dir="rtl" className="mb-4 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
          הבנייה האוטומטית ב-{AUTOMATION.buildDayOfMonth} לחודש כבויה עד שחוקי התכנון יאושרו (גרסה {RULES_VERSION}).
          אפשר לבנות ולשלוח פריסות ידנית מכאן. החוקים מתועדים ב-<code>docs/media-plan-playbook.md</code>;
          להפעלה — <code>MEDIA_PLAN_AUTOMATION=on</code>.
        </div>
      )}
      <MediaPlanBoard brands={brands} month={month} initialPlans={plans} months={months} />
    </AppShell>
  );
}
