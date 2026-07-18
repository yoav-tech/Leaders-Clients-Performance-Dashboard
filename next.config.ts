import type { NextConfig } from "next";

// Security headers applied to every response.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    // Lock the dashboard to first-party resources only — no outsourced/external scripts,
    // styles, images, fonts, or network calls can load or run. 'unsafe-inline' on script is
    // required by Next.js's inline runtime + the no-flash theme script (external script
    // origins are still fully blocked, which is what stops third-party/scraper scripts).
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
    ].join("; "),
  },
  { key: "X-Robots-Tag", value: "noindex, nofollow" }, // internal tool — keep out of search engines
];

const nextConfig: NextConfig = {
  // A parent-level package-lock.json exists on this machine; pin the tracing root to
  // this project so Next doesn't infer the wrong workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // Internal dashboard — don't block deploys on lint. Type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false, // don't advertise Next.js version
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
