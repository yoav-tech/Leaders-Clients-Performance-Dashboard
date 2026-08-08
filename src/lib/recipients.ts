// Staged email recipients for the alerting rollout.
//   Stage 1 (now):   media managers receive the daily digest.
//   Stage 2 (later): per-brand client account managers.
//   Stage 3 (later): external clients (from dashboard_users by brand).
// Overridable via EMAIL_MEDIA_MANAGERS (comma-separated) without a code change.
export function mediaManagers(): string[] {
  const env = process.env.EMAIL_MEDIA_MANAGERS;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return ["yoav@ldrsgroup.com", "gal.z@ldrsgroup.com"];
}

// Stage 2 — per-brand account (client) manager(s). Fill per client below, or override per brand via
// EMAIL_MANAGER_<BRAND_ID> (uppercase, dashes→underscores), e.g. EMAIL_MANAGER_LA_BEAUTE.
const BRAND_MANAGERS: Record<string, string[]> = {
  // "argania": ["manager@ldrsgroup.com"],
};
export function brandManagers(brandId: string): string[] {
  const env = process.env[`EMAIL_MANAGER_${brandId.toUpperCase().replace(/-/g, "_")}`];
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return BRAND_MANAGERS[brandId] ?? [];
}
