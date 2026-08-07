const TZ = "Asia/Jerusalem";

// Today's date (YYYY-MM-DD) in the agency's timezone, independent of server locale.
export function today(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA gives YYYY-MM-DD
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Shift a YYYY-MM-DD date by N days (exported for connectors that page over ranges).
export function shiftDate(isoDate: string, days: number): string {
  return addDays(isoDate, days);
}

// Current-month progress (agency timezone), for budget pacing.
export function monthProgress(): { monthStart: string; elapsed: number; daysInMonth: number } {
  const t = today();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  return {
    monthStart: t.slice(0, 8) + "01",
    elapsed: Number(t.slice(8, 10)),
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(), // day 0 of next month
  };
}

// The agency-timezone (Asia/Jerusalem) calendar date for any timestamp. Used to bucket
// store orders (stored in UTC) onto the same days the ad platforms report in.
export function localDate(ts: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

export type RangeKey = "today" | "yesterday" | "7d" | "14d" | "30d" | "this_month" | "last_month" | "all_time" | "custom";

export interface RangePreset {
  key: RangeKey;
  label: string;
}

// Earliest date covered by "all time" (before any Leaders ad data).
export const ALL_TIME_START = "2024-01-01";

// Preset buttons shown in the date-range picker (Google-Ads-style).
export const RANGE_PRESETS: RangePreset[] = [
  { key: "today", label: "היום" },
  { key: "yesterday", label: "אתמול" },
  { key: "7d", label: "7 ימים אחרונים" },
  { key: "14d", label: "14 ימים אחרונים" },
  { key: "30d", label: "30 ימים אחרונים" },
  { key: "this_month", label: "החודש" },
  { key: "last_month", label: "חודש שעבר" },
  { key: "all_time", label: "כל הזמן" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Resolve a concrete inclusive [from, to] range + key from URL params. Presets via
// ?range=<key>; a custom range via ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
export function resolveRange(sp: {
  range?: string;
  from?: string;
  to?: string;
}): { key: RangeKey; from: string; to: string } {
  const t = today();

  if (sp.from && sp.to && DATE_RE.test(sp.from) && DATE_RE.test(sp.to)) {
    const from = sp.from <= sp.to ? sp.from : sp.to;
    const to = sp.from <= sp.to ? sp.to : sp.from;
    return { key: "custom", from, to };
  }

  switch (sp.range) {
    case "today":
      return { key: "today", from: t, to: t };
    case "yesterday": {
      const y = addDays(t, -1);
      return { key: "yesterday", from: y, to: y };
    }
    case "7d":
      return { key: "7d", from: addDays(t, -6), to: t };
    case "14d":
      return { key: "14d", from: addDays(t, -13), to: t };
    case "30d":
      return { key: "30d", from: addDays(t, -29), to: t };
    case "all_time":
      return { key: "all_time", from: ALL_TIME_START, to: t };
    case "last_month": {
      const firstThis = t.slice(0, 8) + "01";
      const to = addDays(firstThis, -1); // last day of previous month
      const from = to.slice(0, 8) + "01";
      return { key: "last_month", from, to };
    }
    case "this_month":
    default:
      return { key: "this_month", from: t.slice(0, 8) + "01", to: t };
  }
}
