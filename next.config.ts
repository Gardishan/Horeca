import type { NextConfig } from "next";
import { buildStaticSecurityHeaders } from "./lib/web-security";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    typedEnv: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildStaticSecurityHeaders(),
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
