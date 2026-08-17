import Link from "next/link";
import { getBrand, explorerChannels, type BrandConfig } from "@/lib/brands";
import { getCampaignBrandMetrics } from "@/lib/campaignMetrics";
import { getBrandMonthSpend } from "@/lib/queries";
import CampaignBrandView from "./CampaignBrandView";
import ContentCalendar from "./ContentCalendar";
import BriefsPanel from "./BriefsPanel";

// Marketing command center for Leaders — one place, two sub-sections (Leaders marketing / Bestie),
// each with three tabs: paid data (reuse CampaignBrandView), the native content calendar (+ CEO
// approvals), and creative briefs. Sub-section + tab are URL-driven (?sub=&tab=) so it stays
// shareable and re-renders server-side on switch. Organic performance numbers are Phase 2.
type Tab = "data" | "calendar" | "briefs";
const TABS: { id: Tab; label: string }[] = [
  { id: "data", label: "מבט על ונתונים" },
  { id: "calendar", label: "לוח תוכן" },
  { id: "briefs", label: "בריפים" },
];

const SUB_LABEL: Record<string, string> = { leaders: "שיווק לידרס", bestie: "Bestie" };

export default async function CommandCenterView({
  brand,
  subId,
  tab,
  range,
  asParam,
}: {
  brand: BrandConfig;
  subId: string;
  tab: string;
  range: { key: string; from: string; to: string };
  asParam: string; // "&as=client" when an admin previews as client, else ""
}) {
  const subs = brand.commandCenter?.subSections ?? [brand.id];
  const activeSub = subs.includes(subId) ? subId : subs[0];
  const activeTab: Tab = TABS.some((t) => t.id === tab) ? (tab as Tab) : "data";
  const subBrand = getBrand(activeSub) ?? brand;

  const rangeQ = range.key === "custom" ? `range=custom&from=${range.from}&to=${range.to}` : `range=${range.key}`;
  const href = (s: string, t: Tab) => `/${brand.id}?sub=${s}&tab=${t}&${rangeQ}${asParam}`;

  const pill = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-blue-600 text-white" : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"}`;
  const tabCls = (active: boolean) =>
    `border-b-2 px-3 pb-2 text-sm font-medium ${active ? "border-blue-600 text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Sub-section switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {subs.map((s) => (
          <Link key={s} href={href(s, activeTab)} className={pill(s === activeSub)}>
            {SUB_LABEL[s] ?? getBrand(s)?.name ?? s}
          </Link>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {TABS.map((t) => (
          <Link key={t.id} href={href(activeSub, t.id)} className={tabCls(t.id === activeTab)}>
            {t.label}
          </Link>
        ))}
      </div>

      {activeTab === "data" && <DataTab brand={subBrand} range={range} />}
      {activeTab === "calendar" && <ContentCalendar brandId={subBrand.id} />}
      {activeTab === "briefs" && <BriefsPanel brandId={subBrand.id} />}
    </div>
  );
}

// Paid per-platform data for the active sub-section (organic added in Phase 2).
async function DataTab({ brand, range }: { brand: BrandConfig; range: { from: string; to: string } }) {
  const [metrics, monthSpend] = await Promise.all([
    getCampaignBrandMetrics(brand, range.from, range.to),
    getBrandMonthSpend(brand.id),
  ]);
  return (
    <div dir="ltr">
      <div className="mb-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2.5 text-[13px] text-[var(--muted)]" dir="rtl">
        נתוני מדיה <b className="text-[var(--foreground)]">ממומנת</b> (Meta + Google). נתוני אורגני (אינסטגרם/פייסבוק/לינקדאין) יתווספו בשלב הבא.
      </div>
      <CampaignBrandView
        brand={brand}
        metrics={metrics}
        monthSpend={monthSpend}
        from={range.from}
        to={range.to}
        channels={explorerChannels(brand).map((c) => ({ id: c.id, label: c.label }))}
      />
    </div>
  );
}
