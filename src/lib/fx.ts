// USD -> ILS conversion. We fetch the current rate once per ingest run and store it
// in fx_rates. ILS values pass through at 1.0.

const DEFAULT_USD_ILS = 3.7; // fallback if the FX source is unreachable

export async function fetchUsdIlsRate(): Promise<number> {
  // Free, no-key endpoint. Swap for a keyed provider by setting FX_API_URL.
  const url =
    process.env.FX_API_URL ??
    "https://api.exchangerate.host/latest?base=USD&symbols=ILS";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return DEFAULT_USD_ILS;
    const json = (await res.json()) as { rates?: { ILS?: number } };
    const rate = json.rates?.ILS;
    return rate && rate > 0 ? rate : DEFAULT_USD_ILS;
  } catch {
    return DEFAULT_USD_ILS;
  }
}

// Convert a native-currency amount to ILS given the USD->ILS rate.
export function toIls(amount: number, currency: string, usdIls: number): number {
  if (currency === "ILS") return amount;
  if (currency === "USD") return amount * usdIls;
  // Unknown currency: pass through rather than silently zeroing.
  return amount;
}
