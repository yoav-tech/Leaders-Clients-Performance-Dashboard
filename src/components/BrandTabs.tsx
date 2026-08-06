import Link from "next/link";
import type { BrandConfig } from "@/lib/brands";

// Brand switcher — one brand at a time. Preserves the current date-range query. Only the brands
// the current session may see are passed in (admin → all; client → its own).
export default function BrandTabs({ brands, active, rangeQuery }: { brands: BrandConfig[]; active: string; rangeQuery: string }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1">
      {brands.map((b) => {
        const isActive = b.id === active;
        return (
          <Link
            key={b.id}
            href={`/?brand=${b.id}${rangeQuery}`}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {b.name}
          </Link>
        );
      })}
    </div>
  );
}
