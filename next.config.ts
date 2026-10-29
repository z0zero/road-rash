import type { NextConfig } from "next";

// A client-only static site for Vercel Hobby (ADR 0003): `next build` writes
// the whole game to out/, with no server features.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  cacheComponents: false,
  turbopack: {
    // Pin the root so builds inside agent worktrees (.claude/worktrees/*) never
    // pick up the main checkout's lockfile as the workspace root.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
