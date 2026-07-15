import type { Period } from "./types";

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

// Inclusive [from, to] date bounds for a period.
export function periodRange(period: Period): { from: string; to: string } {
  const to = today();
  switch (period) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: addDays(to, -6), to };
    case "30d":
      return { from: addDays(to, -29), to };
    case "mtd": {
      const from = to.slice(0, 8) + "01";
      return { from, to };
    }
  }
}

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  mtd: "Month to date",
};
