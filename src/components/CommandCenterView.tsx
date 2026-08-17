import { getBrand, explorerChannels, type BrandConfig } from "@/lib/brands";
import { getCampaignBrandMetrics } from "@/lib/campaignMetrics";
import { getBrandMonthSpend } from "@/lib/queries";
import CampaignBrandView from "./CampaignBrandView";
import CommandCenterShell from "./CommandCenterShell";

// Marketing command center for Leaders — one place, two sub-sections (Leaders marketing / Bestie).
// Both sub-sections' paid-data panels are fetched here (server, cached) and handed to the client
// shell, which switches sub-section + tab INSTANTLY with no server round-trip. Organic numbers = P2.
const SUB_LABEL: Record<string, string> = { leaders: "שיווק לידרס", bestie: "Bestie" };

export default async function CommandCenterView({ brand, range }: { brand: BrandConfig; range: { from: string; to: string } }) {
  const subIds = brand.commandCenter?.subSections ?? [brand.id];
  const subBrands = subIds.map((id) => getBrand(id)).filter((b): b is BrandConfig => !!b);

  const subs = await Promise.all(
    subBrands.map(async (sb) => {
      const [metrics, monthSpend] = await Promise.all([
        getCampaignBrandMetrics(sb, range.from, range.to),
        getBrandMonthSpend(sb.id),
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
      };
    }),
  );

  return <CommandCenterShell subs={subs} />;
}
