import { getBrand, explorerChannels, type BrandConfig } from "@/lib/brands";
import { getCampaignBrandMetrics } from "@/lib/campaignMetrics";
import { getBrandMonthSpend } from "@/lib/queries";
import { getReportNote } from "@/lib/clientReportStore";
import CampaignBrandView from "./CampaignBrandView";
import LeadsReportPanels from "./LeadsReportPanels";
import CommandCenterShell from "./CommandCenterShell";

// Marketing command center for Leaders — one place, two sub-sections (Leaders marketing / Bestie).
// Each sub-section's paid-data + report panels are fetched here (server, cached) and handed to the
// client shell, which switches sub-section + tab INSTANTLY with no server round-trip. Organic = P2.
const SUB_LABEL: Record<string, string> = { leaders: "שיווק לידרס", bestie: "Bestie" };

export default async function CommandCenterView({ brand, range, canEdit }: { brand: BrandConfig; range: { from: string; to: string }; canEdit: boolean }) {
  const subIds = brand.commandCenter?.subSections ?? [brand.id];
  const subBrands = subIds.map((id) => getBrand(id)).filter((b): b is BrandConfig => !!b);

  const subs = await Promise.all(
    subBrands.map(async (sb) => {
      const [metrics, monthSpend, note] = await Promise.all([
        getCampaignBrandMetrics(sb, range.from, range.to),
        getBrandMonthSpend(sb.id),
        getReportNote(sb.id, "custom", range.from, range.to),
      ]);
      return {
        id: sb.id,
        label: SUB_LABEL[sb.id] ?? sb.name,
        data: (
          <CampaignBrandView
            brand={sb}
            metrics={metrics}
            monthSpend={monthSpend}
            from={range.from}
            to={range.to}
            channels={explorerChannels(sb).map((c) => ({ id: c.id, label: c.label }))}
          />
        ),
        report: <LeadsReportPanels brand={sb} metrics={metrics} note={note} canEdit={canEdit} from={range.from} to={range.to} />,
      };
    }),
  );

  return <CommandCenterShell subs={subs} />;
}
