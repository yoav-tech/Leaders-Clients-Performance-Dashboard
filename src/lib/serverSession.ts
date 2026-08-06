// Server-side session accessor for RSC pages and route handlers. Reads the session cookie via
// next/headers and returns the parsed identity, plus brand-authorization helpers.
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth";
import { readSession, canAccessBrand, type Session } from "./session";
import { BRANDS, type BrandConfig } from "./brands";

export async function getServerSession(): Promise<Session | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return readSession(value, Math.floor(Date.now() / 1000));
}

// Brands this session may see (admin → all; client → its brand_ids, in canonical order).
export function allowedBrands(session: Session | null): BrandConfig[] {
  if (!session) return [];
  if (session.role === "admin") return BRANDS;
  return BRANDS.filter((b) => session.brands.includes(b.id));
}

export { canAccessBrand };
