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
