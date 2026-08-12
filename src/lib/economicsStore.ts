// Persistence for the per-client unit economics (brand_economics). One row per brand, replaced
// whenever the client re-confirms their numbers.
import { getSupabase, hasDb } from "./db";
import type { UnitEconomics } from "./unitEconomics";

const SELECT =
  "brand_id,aov,gross_margin_pct,shipping_per_order,payment_fee_pct,other_variable_per_order,target_profit_share,ltv_multiple,source,notes,collected_at";

type Row = Record<string, unknown>;

function toEconomics(r: Row): UnitEconomics {
  return {
    aov: Number(r.aov),
    grossMarginPct: Number(r.gross_margin_pct),
    shippingPerOrder: Number(r.shipping_per_order),
    paymentFeePct: Number(r.payment_fee_pct),
    otherVariablePerOrder: Number(r.other_variable_per_order),
    targetProfitShare: Number(r.target_profit_share),
    ltvMultiple: Number(r.ltv_multiple),
    source: (r.source as string | null) ?? undefined,
    notes: (r.notes as string | null) ?? undefined,
    collectedAt: (r.collected_at as string | null) ?? undefined,
  };
}

export async function getEconomics(brandId: string): Promise<UnitEconomics | null> {
  if (!hasDb()) return null;
  const { data, error } = await getSupabase().from("brand_economics").select(SELECT).eq("brand_id", brandId).maybeSingle();
  if (error) throw new Error(`brand_economics read failed: ${error.message}`);
  return data ? toEconomics(data as Row) : null;
}

export async function listEconomics(brandIds: string[]): Promise<Record<string, UnitEconomics>> {
  const out: Record<string, UnitEconomics> = {};
  if (!hasDb() || !brandIds.length) return out;
  const { data, error } = await getSupabase().from("brand_economics").select(SELECT).in("brand_id", brandIds);
  if (error) throw new Error(`brand_economics list failed: ${error.message}`);
  for (const r of data ?? []) out[String((r as Row).brand_id)] = toEconomics(r as Row);
  return out;
}

export async function saveEconomics(brandId: string, e: UnitEconomics): Promise<void> {
  if (!hasDb()) throw new Error("database not configured");
  const now = new Date().toISOString();
  const { error } = await getSupabase().from("brand_economics").upsert(
    {
      brand_id: brandId,
      aov: e.aov,
      gross_margin_pct: e.grossMarginPct,
      shipping_per_order: e.shippingPerOrder,
      payment_fee_pct: e.paymentFeePct,
      other_variable_per_order: e.otherVariablePerOrder,
      target_profit_share: e.targetProfitShare,
      ltv_multiple: e.ltvMultiple,
      source: e.source ?? null,
      notes: e.notes ?? null,
      collected_at: now,
      updated_at: now,
    },
    { onConflict: "brand_id" },
  );
  if (error) throw new Error(`brand_economics save failed: ${error.message}`);
}
