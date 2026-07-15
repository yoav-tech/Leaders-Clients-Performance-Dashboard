import Link from "next/link";
import { PERIOD_LABELS } from "@/lib/dates";
import type { Period } from "@/lib/types";

const ORDER: Period[] = ["today", "7d", "30d", "mtd"];

export default function PeriodSelector({ active }: { active: Period }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1">
      {ORDER.map((p) => {
        const isActive = p === active;
        return (
          <Link
            key={p}
            href={`/?period=${p}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        );
      })}
    </div>
  );
}
