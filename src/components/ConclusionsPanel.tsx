import type { BrandConfig } from "@/lib/brands";
import { periodLabel } from "@/lib/clientReport";
import { getReportNote } from "@/lib/clientReportStore";
import ReportConclusions from "./ReportConclusions";

// The conclusions editor for every report type that isn't e-commerce.
//
// E-commerce has ClientReportPanels, which carries the report tables as well; the awareness, leads,
// app and impression-share views already render their own tables, so all they were missing was the
// verbal summary — the drafting button, the manager's editing, and the send. Adding it here rather
// than inside each view keeps one copy of the wiring and means a new report type gets it by being
// routed to, not by being remembered.
//
// Async server component — render it inside a <Suspense> so the report itself paints first.
export default async function ConclusionsPanel({
  brand,
  from,
  to,
  canEdit,
}: {
  brand: BrandConfig;
  from: string;
  to: string;
  canEdit: boolean;
}) {
  const note = await getReportNote(brand.id, "custom", from, to);
  // A client with nothing written for them yet shouldn't be shown an empty panel.
  if (!canEdit && !note.note.trim()) return null;

  return (
    <ReportConclusions
      brandId={brand.id}
      from={from}
      to={to}
      periodLabel={periodLabel(from, to)}
      summary=""
      initialNote={note.note}
      initialStatus={note.status === "sent" ? "sent" : "draft"}
      initialSentAt={note.sentAt}
      canEdit={canEdit}
      canDraft
    />
  );
}
