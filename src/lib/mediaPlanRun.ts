// Orchestrates the monthly media-plan cycle.
//
//   24th of the month  → buildMonthlyDrafts(): build next month's plan for every client, store it
//                        as a draft, and email the media managers one review digest.
//   manager approves   → sendApprovedPlan(): email that client's account manager the final plan.
//
// Nothing reaches a client's account manager without an explicit approval — the cron only ever
// writes drafts and mails the internal team.
import { BRANDS, getBrand } from "./brands";
import { today } from "./dates";
import { emailConfigured, sendEmail } from "./email";
import { brandManagers, mediaManagers } from "./recipients";
import { appBaseUrl } from "./taskLink";
import { buildMediaPlan, nextMonthOf, type MediaPlanDraft } from "./mediaPlanBuilder";
import { generatePlanRationale, narrativeConfigured } from "./mediaPlanNarrative";
import { approvePlan, getPlan, listPlans, markSent, saveDraft, type StoredPlan } from "./mediaPlanStore";
import { planSubject, renderPlanHtml, renderPlanText, renderReviewHtml, renderReviewText, reviewSubject } from "./mediaPlanEmail";

export function reviewUrl(month: string): string {
  return `${appBaseUrl()}/media-plan?month=${month}`;
}

// Replace the builder's deterministic bullets with Claude's, when a key is configured. Mutates
// in place; a failed or unconfigured call leaves the deterministic ones standing.
async function withNarrative(draft: MediaPlanDraft): Promise<MediaPlanDraft> {
  if (!narrativeConfigured()) return draft;
  const bullets = await generatePlanRationale(draft);
  if (bullets.length) draft.rationale = bullets;
  return draft;
}

// Build (or rebuild) one brand's draft and store it.
export async function buildDraftFor(brandId: string, month: string, opts: { budgetOverride?: number; force?: boolean } = {}): Promise<MediaPlanDraft> {
  const brand = getBrand(brandId);
  if (!brand) throw new Error(`unknown brand: ${brandId}`);
  const draft = await withNarrative(await buildMediaPlan(brand, month, { budgetOverride: opts.budgetOverride }));
  await saveDraft(draft, opts.force ?? false);
  return draft;
}

export interface BuildRunResult {
  month: string;
  built: string[];
  skipped: { brandId: string; reason: string }[];
  notified: string[];
  preview?: string;
}

// The 24th-of-the-month job. Builds every client's plan for the next calendar month.
export async function buildMonthlyDrafts(
  opts: { month?: string; dry?: boolean; onlyBrand?: string; force?: boolean } = {},
): Promise<BuildRunResult> {
  const month = opts.month ?? nextMonthOf(today());
  const built: string[] = [];
  const skipped: { brandId: string; reason: string }[] = [];
  const drafts: MediaPlanDraft[] = [];

  for (const brand of BRANDS) {
    if (opts.onlyBrand && brand.id !== opts.onlyBrand) continue;
    try {
      const existing = await getPlan(brand.id, month);
      if (existing && existing.status !== "draft" && !opts.force) {
        skipped.push({ brandId: brand.id, reason: existing.status });
        continue;
      }
      // A brand with neither a configured budget nor spend history has nothing to plan —
      // building it would put an empty ₪0 card in front of the reviewers.
      const draft = await buildMediaPlan(brand, month);
      if (draft.totalBudget <= 0) {
        skipped.push({ brandId: brand.id, reason: "no budget or spend history" });
        continue;
      }
      if (!opts.dry) {
        await withNarrative(draft);
        await saveDraft(draft, opts.force ?? false);
      }
      drafts.push(draft);
      built.push(brand.id);
    } catch (e) {
      skipped.push({ brandId: brand.id, reason: e instanceof Error ? e.message : String(e) });
      console.error("[mediaPlan] build", brand.id, e instanceof Error ? e.message : String(e));
    }
  }

  if (opts.dry) {
    return { month, built, skipped, notified: [], preview: renderReviewText(drafts.map(asStored), month, reviewUrl(month)) };
  }

  // One digest to the media managers — the only mail this job sends.
  const notified: string[] = [];
  const to = mediaManagers();
  if (built.length && to.length && emailConfigured()) {
    const stored = (await listPlans(month)).filter((p) => built.includes(p.brandId));
    try {
      await sendEmail({
        to,
        subject: reviewSubject(month, stored.length),
        html: renderReviewHtml(stored, month, reviewUrl(month)),
        text: renderReviewText(stored, month, reviewUrl(month)),
      });
      notified.push(...to);
    } catch (e) {
      console.error("[mediaPlan] review email", e instanceof Error ? e.message : String(e));
    }
  }

  return { month, built, skipped, notified };
}

// A freshly built draft rendered as if it came back from the store (for dry-run previews).
function asStored(d: MediaPlanDraft): StoredPlan {
  return { ...d, status: "draft", approvedBy: null, approvedAt: null, sentTo: [], sentAt: null, updatedAt: null };
}

export interface SendResult {
  ok: boolean;
  to: string[];
  error?: string;
}

// Approve (if still a draft) and email the client's account manager. Refuses to send when the
// brand has no account manager configured, rather than silently doing nothing.
export async function sendApprovedPlan(
  brandId: string,
  month: string,
  opts: { approvedBy: string; overrideTo?: string },
): Promise<SendResult> {
  const plan = (await approvePlan(brandId, month, opts.approvedBy)) ?? (await getPlan(brandId, month));
  if (!plan) return { ok: false, to: [], error: "plan not found" };
  if (plan.status === "sent") return { ok: false, to: plan.sentTo, error: "already sent" };

  const to = opts.overrideTo ? [opts.overrideTo] : brandManagers(brandId);
  if (!to.length) return { ok: false, to: [], error: "no account manager configured for this brand" };
  if (!emailConfigured()) return { ok: false, to, error: "SMTP not configured" };

  await sendEmail({ to, subject: planSubject(plan), html: renderPlanHtml(plan), text: renderPlanText(plan) });
  if (!opts.overrideTo) await markSent(brandId, month, to);
  return { ok: true, to };
}
