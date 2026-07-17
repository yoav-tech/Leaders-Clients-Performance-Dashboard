// Official Leaders / LDRS wordmark (white version, for dark backgrounds).
export default function LeadersLogo({ height = 30 }: { height?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/leaders-logo-white.png"
      alt="Leaders — Powered by People"
      style={{ height, width: "auto" }}
    />
  );
}
