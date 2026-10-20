import type { NextConfig } from "next";

const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

const nextConfig: NextConfig = {
  // Next 16 blocks /_next/* from 127.0.0.1 when the tab origin differs from
  // the printed "Local" host (localhost vs 127.0.0.1) — Save then appears dead.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
