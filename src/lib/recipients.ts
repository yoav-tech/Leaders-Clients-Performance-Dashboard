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
