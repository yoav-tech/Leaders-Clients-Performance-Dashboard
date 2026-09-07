// Haat's weekly cost-per-registration summary, pulled from the team's Google Sheet.
//
// The sheet is the source of truth for registrations: they're counted in Haat's own system and run
// well above what Meta attributes, so we take the numbers as published rather than recomputing.
// The tab is read through Google's CSV export, which needs no credentials while the sheet stays
// link-shared — if sharing is ever revoked the fetch 302s to a login page and we fail loudly.
import type { ManualRegionRow, ManualRegionSummary } from "./haatRegions";

const SHEET_ID = process.env.HAAT_SHEET_ID || "15vqUkopeYdL0QaaldNkww4GAFDc-gOVQsjBeuwUXGew";
const TAB = "עלות להרשמה שבוע אחרון";

export interface HaatWeekRow extends ManualRegionRow {
  prevCpr: number | null;   // "מחיר בדיקה קודמת"
  direction: "down" | "up" | null; // הוזלה / התייקרות
}
export interface HaatWeekSummary extends Omit<ManualRegionSummary, "rows"> {
  rows: HaatWeekRow[];
  capturedAt: string;
}

// Minimal RFC-4180 CSV reader — the sheet has quoted fields containing commas (₪4,495).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// " ₪4,495" → 4495 ; "" → null
const money = (v: string): number | null => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

export async function fetchHaatWeeklySheet(): Promise<HaatWeekSummary> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB)}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Haat sheet ${res.status}`);
  const text = await res.text();
  // A revoked share redirects to an HTML sign-in page rather than erroring.
  if (/^\s*</.test(text)) throw new Error("Haat sheet is no longer link-shared (got HTML, not CSV)");

  const grid = parseCsv(text);
  const header = grid.findIndex((r) => r.some((c) => c.trim() === "עיר"));
  if (header < 0) throw new Error("Haat sheet: header row not found");
  const cols = grid[header].map((c) => c.trim());
  const at = (r: string[], name: string) => r[cols.indexOf(name)] ?? "";

  const rows: HaatWeekRow[] = [];
  let total: ManualRegionRow | null = null;

  for (const r of grid.slice(header + 1)) {
    const city = at(r, "עיר").trim();
    if (!city) continue;
    const spend = money(at(r, "הוצאה"));
    const regs = money(at(r, "הרשמות"));
    const cpr = money(at(r, "עלות להרשמה"));
    if (spend == null || regs == null) continue;
    const dirText = at(r, "הוזלה/התייקרות").trim();
    const entry: HaatWeekRow = {
      city,
      spend,
      regs,
      cpr: cpr ?? (regs ? Math.round(spend / regs) : 0),
      prevCpr: money(at(r, "מחיר בדיקה קודמת")),
      direction: dirText === "הוזלה" ? "down" : dirText === "התייקרות" ? "up" : null,
    };
    if (/grand total|סה.?כ/i.test(city)) total = { ...entry, city: "סה״כ" };
    else rows.push(entry);
  }

  if (!rows.length) throw new Error("Haat sheet: no city rows parsed");
  // Prefer the sheet's own Grand Total; fall back to summing if it's missing.
  if (!total) {
    const spend = rows.reduce((a, r) => a + r.spend, 0);
    const regs = rows.reduce((a, r) => a + r.regs, 0);
    total = { city: "סה״כ", spend, regs, cpr: regs ? Math.round(spend / regs) : 0 };
  }

  rows.sort((a, b) => b.regs - a.regs);
  return { label: "שבוע אחרון", rows, total, capturedAt: new Date().toISOString() };
}
