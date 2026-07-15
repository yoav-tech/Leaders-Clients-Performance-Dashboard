import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A parent-level package-lock.json exists on this machine; pin the tracing root to
  // this project so Next doesn't infer the wrong workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // Internal dashboard — don't block deploys on lint. Type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
