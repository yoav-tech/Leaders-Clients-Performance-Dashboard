// Leaders / LDRS logo mark — matches the shared favicon used across Leaders dashboards
// (indigo rounded square + white "L").
export default function LeadersLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Leaders"
      role="img"
    >
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <text
        x="32"
        y="43"
        fontFamily="Heebo, Arial, sans-serif"
        fontSize="30"
        fontWeight="800"
        fill="#fff"
        textAnchor="middle"
      >
        L
      </text>
    </svg>
  );
}
