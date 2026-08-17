import Sidebar from "./Sidebar";
import type { BrandConfig } from "@/lib/brands";

// App layout: persistent right-side sidebar (RTL) + main content column with a slim top bar.
// Used by the dashboard, the admin console, and the account page.
export default function AppShell({
  allowed,
  activeBrand,
  activeSection,
  isAdmin,
  rangeQuery,
  accountLabel,
  accountSub,
  topBar,
  children,
}: {
  allowed: BrandConfig[];
  activeBrand: string;
  activeSection: "brands" | "admin" | "media-plan" | "account";
  isAdmin: boolean;
  rangeQuery: string;
  accountLabel: string;
  accountSub: string;
  topBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell" dir="rtl">
      <Sidebar
        brands={allowed.filter((b) => !b.navHidden).map((b) => ({ id: b.id, name: b.name }))}
        activeBrand={activeBrand}
        activeSection={activeSection}
        isAdmin={isAdmin}
        rangeQuery={rangeQuery}
        accountLabel={accountLabel}
        accountSub={accountSub}
      />
      <div className="app-main">
        {topBar ? <div className="app-topbar">{topBar}</div> : null}
        {/* Report content is English → render LTR. The sidebar + top bar stay RTL. Hebrew
            sub-panels (account/admin forms) set their own dir="rtl" locally. */}
        <main className="app-content dash-aura" dir="ltr">{children}</main>
      </div>
    </div>
  );
}
