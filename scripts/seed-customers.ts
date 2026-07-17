// One-time seed of store_customers first-seen dates from full QuickShop order history,
// so new-vs-returning classification is accurate. Run:
//   npx tsx --env-file-if-exists=.env.local scripts/seed-customers.ts [startDate] [endDate]
import { BRANDS } from "../src/lib/brands";
import { fetchQuickShopPaidOrders, quickshopKeyFor } from "../src/lib/quickshop";
import { getSupabase } from "../src/lib/db";
import { today } from "../src/lib/dates";

async function main() {
  const start = process.argv[2] ?? "2022-01-01";
  const end = process.argv[3] ?? today();
  const sb = getSupabase();

  for (const brand of BRANDS) {
    if (brand.storePlatform !== "quickshop" || !quickshopKeyFor(brand)) continue;
    console.log(`Seeding ${brand.id} from ${start} → ${end} …`);
    const orders = await fetchQuickShopPaidOrders(brand, start, end);

    const firstSeen = new Map<string, string>();
    for (const o of orders) {
      if (!o.customerId) continue;
      const prev = firstSeen.get(o.customerId);
      if (!prev || o.date < prev) firstSeen.set(o.customerId, o.date);
    }

    const rows = [...firstSeen].map(([customer_id, first_seen]) => ({
      brand_id: brand.id,
      customer_id,
      first_seen,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      // Authoritative full-history seed: overwrite with the true earliest date.
      const { error } = await sb.from("store_customers").upsert(chunk, { onConflict: "brand_id,customer_id" });
      if (error) throw new Error(error.message);
    }
    console.log(`  ${brand.id}: ${orders.length} paid orders → ${rows.length} customers seeded`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
