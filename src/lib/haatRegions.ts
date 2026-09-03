// Hebrew labels + the client's manual August summary for Haat's city campaigns.
//
// Cities arrive from the campaign name (`LDRS || <city> || …`) in English, with the account's own
// spellings — including the "Jeruslaem" typo — so everything user-facing goes through cityLabel().
const CITY_HE: Record<string, string> = {
  jeruslaem: "ירושלים",
  jerusalem: "ירושלים",
  haifa: "חיפה",
  afula: "עפולה",
  jaffa: "יפו",
  acre: "עכו",
  akko: "עכו",
  nahariya: "נהריה",
  maalot: "מעלות",
  harish: "חריש",
};

export const cityLabel = (city: string): string => CITY_HE[city.trim().toLowerCase()] ?? city;

export interface ManualRegionRow { city: string; spend: number; regs: number; cpr: number }
export interface ManualRegionSummary { label: string; rows: ManualRegionRow[]; total: ManualRegionRow }

// Last week, supplied by the client as a manual summary (same source as the monthly one below).
export const HAAT_LAST_WEEK: ManualRegionSummary = {
  label: "שבוע אחרון",
  rows: [
    { city: "ירושלים", spend: 5289.6, regs: 262, cpr: 20 },
    { city: "חיפה", spend: 4548.22, regs: 178, cpr: 26 },
    { city: "עפולה", spend: 4120.54, regs: 126, cpr: 33 },
    { city: "יפו", spend: 2068.26, regs: 117, cpr: 18 },
    { city: "עכו", spend: 2327.54, regs: 63, cpr: 37 },
    { city: "נהריה", spend: 1583.43, regs: 50, cpr: 32 },
    { city: "מעלות", spend: 630.35, regs: 13, cpr: 48 },
    { city: "חריש", spend: 391.64, regs: 10, cpr: 39 },
  ],
  total: { city: "סה״כ", spend: 20959.58, regs: 819, cpr: 26 },
};

// August 2026, supplied by the client as a manual summary. The registration counts come from Haat's
// own backend — NOT from Meta's attributed registrations, which run ~30-40% lower (2,202 vs 3,080)
// because Meta only credits what it can attribute. Spend matches our data to the shekel. Kept
// verbatim as the client's reference figures; do not "correct" it against the live numbers.
export const HAAT_AUGUST_2026: ManualRegionSummary = {
  label: "אוגוסט 2026",
  rows: [
    { city: "ירושלים", spend: 21878, regs: 996, cpr: 22 },
    { city: "חיפה", spend: 16397, regs: 728, cpr: 23 },
    { city: "עפולה", spend: 16501, regs: 590, cpr: 28 },
    { city: "יפו", spend: 7464, regs: 305, cpr: 24 },
    { city: "עכו", spend: 5513, regs: 194, cpr: 28 },
    { city: "מעלות", spend: 5089, regs: 118, cpr: 43 },
    { city: "נהריה", spend: 3616, regs: 115, cpr: 31 },
    { city: "חריש", spend: 1765, regs: 34, cpr: 52 },
  ],
  total: { city: "סה״כ", spend: 78223, regs: 3080, cpr: 25 },
};

// The cities Haat runs city-level campaigns in — the rows of the budget-request form.
export const HAAT_CITIES: string[] = HAAT_AUGUST_2026.rows.map((r) => r.city);
