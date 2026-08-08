// USD -> ILS conversion. We fetch the current rate once per ingest run and store it
// in fx_rates. ILS values pass through at 1.0.

const DEFAULT_USD_ILS = 3; // Fixed USD→ILS rate used for normalisation.

export async function fetchUsdIlsRate(): Promise<number> {
  // Fixed rate by request. Override with the FX_USD_ILS env var if needed.
  const override = Number(process.env.FX_USD_ILS);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_USD_ILS;
}

// EUR→ILS representative rate (e.g. Colgate bills in EUR). Fixed, overridable via FX_EUR_ILS.
const DEFAULT_EUR_ILS = 4;
export function eurIlsRate(): number {
  const override = Number(process.env.FX_EUR_ILS);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_EUR_ILS;
}

// Convert a native-currency amount to ILS. usdIls is the USD→ILS rate; EUR uses eurIlsRate().
export function toIls(amount: number, currency: string, usdIls: number, eurIls = eurIlsRate()): number {
  if (currency === "ILS") return amount;
  if (currency === "USD") return amount * usdIls;
  if (currency === "EUR") return amount * eurIls;
  // Unknown currency: pass through rather than silently zeroing.
  return amount;
}
