// Learning from what actually went to the client.
//
// Asking a manager to approve or correct each recommendation put the work of teaching the engine on
// top of the work of writing the report, so it would have been done once and then skipped. The
// signal was already there anyway: the manager edits the draft in the editor and presses send, and
// the difference between what the engine wrote and what they sent IS the correction. So nothing is
// asked of anyone — the draft is remembered when it's generated, and the send is diffed against it.
//
// Three outcomes per rule, all recorded against (brand, rule):
//   kept unchanged  → the wording is right for this client; keep writing it
//   edited          → the manager's wording replaces it, stored as a template (insightTemplate) so
//                     next period's figures are re-rendered rather than replayed
//   dropped         → the manager deleted the finding before sending. Once is an edit to one
//                     report; repeatedly is a statement that this rule doesn't belong in this
//                     client's summary, so after a threshold the engine stops drafting it.
import { getSupabase, hasDb } from "./db";
import { saveInsightFeedback, type InsightFeedback } from "./insightFeedbackStore";
import { toTemplate } from "./insightTemplate";

export interface DraftedLine { id: string; text: string; data: Record<string, number> }

export async function saveDraftedLines(brandId: string, from: string, to: string, lines: DraftedLine[]): Promise<void> {
  if (!hasDb() || !lines.length) return;
  const { error } = await getSupabase().from("insight_drafts").upsert(
    { brand_id: brandId, from_date: from, to_date: to, lines, created_at: new Date().toISOString() },
    { onConflict: "brand_id,from_date,to_date" },
  );
  if (error) throw new Error(error.message);
}

export async function getDraftedLines(brandId: string, from: string, to: string): Promise<DraftedLine[]> {
  if (!hasDb()) return [];
  const { data, error } = await getSupabase()
    .from("insight_drafts").select("lines")
    .match({ brand_id: brandId, from_date: from, to_date: to }).maybeSingle();
  if (error || !data) return [];
  return (data.lines as DraftedLine[]) ?? [];
}

// ── matching sent text back to the lines that produced it ───────────────────────────────────────

const STOP = new Set(["של", "על", "את", "מול", "עם", "אנחנו", "אנו", "זה", "הוא", "היא", "יותר", "כדי", "לא", "גם", "אבל", "או", "כל", "אל", "לפי", "בין"]);

/** Words that carry meaning, normalised — figures are dropped because they change every period and
 *  would otherwise make an unedited line look rewritten. */
function tokens(s: string): Set<string> {
  return new Set(
    s.replace(/[₪%,]/g, " ").replace(/\d+(?:\.\d+)?/g, " ")
      .split(/[\s.,;:!?"'()\[\]—–-]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/** Dice coefficient over meaningful words: 1 = the same sentence, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return (2 * shared) / (A.size + B.size);
}

/** Bullets the manager actually sent. */
export function sentBullets(note: string): string[] {
  return note.split("\n").map((l) => l.trim())
    .filter((l) => l.startsWith("•"))
    .map((l) => l.replace(/^•\s*/, "").trim())
    .filter(Boolean);
}

const SAME = 0.92;    // above this, treat the line as sent unchanged
const RELATED = 0.15; // a plausible counterpart, even after a heavy rewrite

// Word overlap alone can't separate "rewrote it" from "deleted it": a genuine rewording of a
// finding scored 0.38 in testing, and a heavy one 0.07 — well inside the range where a naive
// threshold would call it a deletion. Getting that wrong is the expensive error, because repeated
// deletions suppress the rule and the engine stops writing something the manager actually wanted.
//
// So the counting decides, not the score. Lines are matched to bullets best-first; if what's left
// over on each side is the same size, the manager rewrote those lines rather than removing them,
// and they pair up in order. A line is only dropped when there is genuinely no bullet left for it.

// A leftover drafted line and a leftover bullet with nothing in common could be a rewrite past all
// recognition, or a deletion plus an unrelated addition. Text alone can't tell them apart, and both
// wrong answers cost: a false "edited" stores the manager's unrelated sentence as this rule's
// wording, a false "dropped" pushes a wanted rule toward suppression. So an ambiguous pair teaches
// nothing at all — the engine keeps its own wording and its drop count untouched.
const PAIRABLE = 0.05;

export type Outcome = "kept" | "edited" | "dropped" | "unclear";
export interface LearnResult { id: string; outcome: Outcome; unresolved?: string[]; dropCount?: number; suppressed?: boolean }

/** How many times a rule must be dropped before the engine stops drafting it for this brand. */
export const DROP_LIMIT = 3;

/**
 * Diff what was sent against what was drafted and record what it teaches. Returns one result per
 * drafted line. Never throws into the send path — teaching the engine must not be able to stop a
 * report reaching a client.
 */
export async function learnFromSend(
  brandId: string,
  drafted: DraftedLine[],
  sentNote: string,
  by: string | null,
  existing: Record<string, InsightFeedback> = {},
): Promise<LearnResult[]> {
  const bullets = sentBullets(sentNote);
  const out: LearnResult[] = [];

  // Best-first assignment, so two similar findings can't both claim the same bullet.
  const pairs: { li: number; bi: number; score: number }[] = [];
  drafted.forEach((line, li) => bullets.forEach((b, bi) => {
    const score = similarity(line.text, b);
    if (score >= RELATED) pairs.push({ li, bi, score });
  }));
  pairs.sort((a, b) => b.score - a.score);

  const lineToBullet = new Map<number, number>();
  const claimed = new Set<number>();
  const ambiguous = new Set<number>();
  for (const p of pairs) {
    if (lineToBullet.has(p.li) || claimed.has(p.bi)) continue;
    lineToBullet.set(p.li, p.bi);
    claimed.add(p.bi);
  }

  // Leftovers on both sides in equal number means those lines were rewritten past recognition, not
  // deleted — pair them in order rather than recording a deletion we can't actually see.
  const looseLines = drafted.map((_, i) => i).filter((i) => !lineToBullet.has(i));
  const looseBullets = bullets.map((_, i) => i).filter((i) => !claimed.has(i));
  if (looseLines.length && looseLines.length === looseBullets.length) {
    looseLines.forEach((li, k) => {
      const bi = looseBullets[k];
      if (similarity(drafted[li].text, bullets[bi]) >= PAIRABLE) lineToBullet.set(li, bi);
      else ambiguous.add(li); // a swap, not a rewrite — see PAIRABLE
    });
  }

  for (let li = 0; li < drafted.length; li++) {
    const line = drafted[li];
    const bi = lineToBullet.get(li);

    if (bi == null && ambiguous.has(li)) {
      out.push({ id: line.id, outcome: "unclear" });
      continue;
    }

    if (bi == null) {
      const prior = existing[line.id];
      const dropCount = (prior?.status === "dropped" ? (prior.dropCount ?? 0) : 0) + 1;
      const suppressed = dropCount >= DROP_LIMIT;
      await saveInsightFeedback(brandId, {
        insightId: line.id, status: "dropped", template: null, correctedRaw: null,
        original: line.text, unresolved: [], updatedBy: by, dropCount, suppressed,
      });
      out.push({ id: line.id, outcome: "dropped", dropCount, suppressed });
      continue;
    }

    const sent = bullets[bi];
    if (similarity(line.text, sent) >= SAME) {
      await saveInsightFeedback(brandId, {
        insightId: line.id, status: "approved", template: null, correctedRaw: null,
        original: line.text, unresolved: [], updatedBy: by, dropCount: 0, suppressed: false,
      });
      out.push({ id: line.id, outcome: "kept" });
      continue;
    }

    const { template, unresolved } = toTemplate(sent, line.data ?? {});
    await saveInsightFeedback(brandId, {
      insightId: line.id, status: "corrected", template, correctedRaw: sent,
      original: line.text, unresolved, updatedBy: by, dropCount: 0, suppressed: false,
    });
    out.push({ id: line.id, outcome: "edited", unresolved });
  }
  return out;
}
