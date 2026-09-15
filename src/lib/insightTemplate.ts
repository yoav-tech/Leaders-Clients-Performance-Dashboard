// Turning a manager's correction into something reusable.
//
// A correction is written against one period, so it is full of that period's figures — "רואס הממומן
// עמד על 2.38". Storing it verbatim and replaying it next month would put August's numbers in
// September's report, which is worse than not learning at all.
//
// So a correction is stored as a template: every figure that matches one the rule computed is
// swapped for a placeholder that remembers BOTH which figure it was and the shape it was written in
// ({{gain|ils}}, {{share|pct}}), and it is re-rendered from next period's data. Wording is what we
// learn; numbers stay live, in the format the manager chose to write them.
//
// Anything numeric the correction mentions that ISN'T one of the rule's own figures can't be
// tracked — a number the manager brought from outside. Those come back as `unresolved` so the
// manager is told, before saving, exactly which figures will be frozen into the wording.

export type Fmt = "ils" | "pct" | "roas" | "int";

const FORMAT: Record<Fmt, (v: number) => string> = {
  ils: (v) => `₪${Math.round(v).toLocaleString("en-US")}`,
  pct: (v) => `${Math.round(v * 100)}%`,
  roas: (v) => v.toFixed(2),
  int: (v) => Math.round(v).toLocaleString("en-US"),
};

/** The shapes a value can appear as in generated copy. Most distinctive first, so "₪1,234" binds
 *  before the bare "1,234" nested inside it. Mirrors the formatters in clientConclusions.ts. */
function renderings(v: number): { fmt: Fmt; token: string }[] {
  const out: { fmt: Fmt; token: string }[] = [];
  out.push({ fmt: "ils", token: FORMAT.ils(v) });
  out.push({ fmt: "pct", token: FORMAT.pct(v) });
  out.push({ fmt: "roas", token: FORMAT.roas(v) });
  const bare = FORMAT.int(v);
  // A bare one- or two-digit number matches far too much Hebrew prose to bind safely.
  if (bare.length >= 3) out.push({ fmt: "int", token: bare });
  return out;
}

// Any digit run left over after binding — used to warn about figures we can't keep current.
const NUMERIC = /₪\s?[\d,]+(?:\.\d+)?|\d[\d,]*(?:\.\d+)?%?/g;

export interface TemplateResult {
  template: string;
  /** Numeric tokens in the correction that matched none of the rule's figures. */
  unresolved: string[];
}

/** Bind a correction's figures to the rule's data, producing a reusable template. */
export function toTemplate(text: string, data: Record<string, number>): TemplateResult {
  let out = text;
  const candidates: { key: string; fmt: Fmt; token: string }[] = [];
  for (const [key, v] of Object.entries(data)) {
    if (!Number.isFinite(v)) continue;
    for (const r of renderings(v)) candidates.push({ key, fmt: r.fmt, token: r.token });
  }
  // Longest token first across every key, so "₪68,784" is never half-eaten by a shorter match.
  candidates.sort((a, b) => b.token.length - a.token.length);

  for (const { key, fmt, token } of candidates) {
    if (!out.includes(token)) continue;
    out = out.split(token).join(`{{${key}|${fmt}}}`);
  }

  const unresolved = [...new Set(out.match(NUMERIC) ?? [])];
  return { template: out, unresolved };
}

/** Re-render a stored template against a fresh period's figures. */
export function renderTemplate(template: string, data: Record<string, number>): string {
  return template.replace(/\{\{(\w+)\|(\w+)\}\}/g, (whole, key: string, fmt: string) => {
    const v = data[key];
    const f = FORMAT[fmt as Fmt];
    // The rule stopped emitting this figure (or the format is unknown) — leave the placeholder
    // visible rather than printing a wrong or empty number into a client-facing draft.
    if (v == null || !Number.isFinite(v) || !f) return whole;
    return f(v);
  });
}

/** Does a stored template still bind cleanly to what the rule emits now? */
export function templateUnbound(template: string, data: Record<string, number>): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{(\w+)\|(\w+)\}\}/g)) {
    const v = data[m[1]];
    if (v == null || !Number.isFinite(v)) out.push(m[1]);
  }
  return [...new Set(out)];
}
