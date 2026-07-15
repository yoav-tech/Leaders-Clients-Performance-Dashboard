// USD -> ILS conversion. We fetch the current rate once per ingest run and store it
// in fx_rates. ILS values pass through at 1.0.

const DEFAULT_USD_ILS = 3; // Fixed USD→ILS rate used for normalisation.

export async function fetchUsdIlsRate(): Promise<number> {
  // Fixed rate by request. Override with the FX_USD_ILS env var if needed.
  const override = Number(process.env.FX_USD_ILS);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_USD_ILS;
}

// Convert a native-currency amount to ILS given the USD->ILS rate.
export function toIls(amount: number, currency: string, usdIls: number): number {
  if (currency === "ILS") return amount;
  if (currency === "USD") return amount * usdIls;
  // Unknown currency: pass through rather than silently zeroing.
  return amount;
}
