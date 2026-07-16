"use client";

import { useState, type ReactNode } from "react";
import type { BrandConfig } from "@/lib/brands";
import type { DayBreakdown } from "@/lib/types";
import { ParticleCard } from "./magicbento/MagicBento";
import BrandDetailModal from "./BrandDetailModal";

// Wraps a brand card with the MagicBento effects and opens the day-by-day
// drill-down modal on click.
export default function BrandCardInteractive({
  brand,
  days,
  children,
}: {
  brand: BrandConfig;
  days: DayBreakdown[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ParticleCard onClick={() => setOpen(true)}>{children}</ParticleCard>
      {open && <BrandDetailModal brand={brand} days={days} onClose={() => setOpen(false)} />}
    </>
  );
}
