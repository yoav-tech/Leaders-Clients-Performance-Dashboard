// Q&A answerer for the two-way ClickUp channel. Builds a compact JSON snapshot of the last
// 7 days of metrics + open alerts for all brands and asks the Anthropic Messages API to answer
// a natural-language question. Raw fetch (no SDK), matching the codebase convention.

import { getBrandMetrics } from "./queries";
import { collectAlerts } from "./alerts";
import { getBrand } from "./brands";
import { shiftDate, today } from "./dates";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function snapshot(): Promise<string> {
  const to = shiftDate(today(), -1);
  const from = shiftDate(to, -6); // last 7 full days
  const [metrics, alerts] = await Promise.all([
    getBrandMetrics(from, to),
    collectAlerts().catch(() => []),
  ]);
  const brands = metrics
    .filter((m) => !getBrand(m.brandId)?.mediaPlan)
    .map((m) => ({
    brand: m.brandId,
    spend: Math.round(m.total.spend),
    adRoas: m.total.roas,
    blendedRoas: m.blendedRoas,
    adRevenue: Math.round(m.total.revenue),
    storeRevenue: Math.round(m.channels.site.revenue),
    orders: Math.round(m.channels.site.purchases),
    purchases: Math.round(m.total.purchases),
    cpa: m.total.cpa,
    cac: m.cac,
    cvr: m.total.cvr,
    newRevenue: Math.round(m.newRevenue),
    returningRevenue: Math.round(m.returningRevenue),
    channels: {
      google: chan(m.channels.google),
      meta: chan(m.channels.meta),
      tiktok: chan(m.channels.tiktok),
    },
    previous: m.previous,
  }));
  return JSON.stringify({
    window: { from, to },
    currency: "ILS",
    brands,
    openAlerts: alerts.map((a) => ({ brand: a.brandId, severity: a.severity, detail: a.detail })),
  });
}

function chan(c: { spend: number; roas: number | null; purchases: number; cvr: number | null }) {
  return { spend: Math.round(c.spend), roas: c.roas, purchases: Math.round(c.purchases), cvr: c.cvr };
}

export async function answerQuestion(question: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const data = await snapshot();

  const system =
    `You are the Leaders performance-dashboard assistant, answering inside a ClickUp channel for a paid-media agency. ` +
    `You have a JSON snapshot of the last 7 full days of paid-media + store metrics for 4 e-commerce brands ` +
    `(argania=Argania, la-beaute=La Beaute, studio-pasha=Studio Pasha, seacret=Seacret). All money is ILS. ` +
    `Definitions: adRoas = ad revenue / ad spend; blendedRoas = store revenue / ad spend; cvr = purchases / clicks; ` +
    `cac = ad spend / new customers. Answer concisely (1–5 lines, ClickUp markdown allowed). Use ONLY the snapshot; ` +
    `if the answer isn't present, say so briefly and suggest opening the dashboard. Do not invent numbers.\n\nSNAPSHOT:\n` +
    data;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${b.slice(0, 300)}`);
  }
  const j = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (j.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  return text || "I couldn't produce an answer — try rephrasing or check the dashboard.";
}
