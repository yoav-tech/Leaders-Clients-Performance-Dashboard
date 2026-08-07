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
  activeSection: "brands" | "admin" | "account";
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
        brands={allowed.map((b) => ({ id: b.id, name: b.name }))}
        activeBrand={activeBrand}
        activeSection={activeSection}
        isAdmin={isAdmin}
        rangeQuery={rangeQuery}
        accountLabel={accountLabel}
        accountSub={accountSub}
      />
      <div className="app-main">
        {topBar ? <div className="app-topbar">{topBar}</div> : null}
        <main className="app-content dash-aura">{children}</main>
      </div>
    </div>
  );
}
