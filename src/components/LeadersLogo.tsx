// Placeholder Leaders logo mark (violet→blue "L"). Swap for the real asset when provided.
export default function LeadersLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Leaders" role="img">
      <defs>
        <linearGradient id="leaders-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#leaders-lg)" />
      <path d="M22 16 h7 v24 h13 v8 H22 Z" fill="#ffffff" />
    </svg>
  );
}
