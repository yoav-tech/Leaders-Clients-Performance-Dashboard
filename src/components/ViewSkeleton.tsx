// Instant loading placeholder shown (in a Suspense boundary) while a brand's report data streams
// in — so switching clients is immediate and consistent instead of a blocking SSR pause.
export default function ViewSkeleton() {
  const bar = "animate-pulse rounded-xl bg-[var(--card-border)]/40";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`${bar} h-[74px]`} />
        ))}
      </div>
      <div className={`${bar} h-64`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${bar} h-44`} />
        <div className={`${bar} h-44`} />
      </div>
    </div>
  );
}
