/** @type {import('next').NextConfig} */
// Must be .mjs — Next.js 14 does not load next.config.cjs (silently ignores it,
// which broke distDir/rewrites/standalone before).
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@egeopolis/game-core"],
  // Standalone output: `next start` keeps working as before (it ignores the
  // standalone folder); the Docker image runs .next/standalone/server.js.
  output: "standalone",
  // NEXT_DIST_DIR lets E2E runs build to an isolated directory (Playwright)
  // without touching the production .next of a running server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
