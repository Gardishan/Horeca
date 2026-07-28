import type { NextConfig } from "next";
import { buildStaticSecurityHeaders } from "./lib/web-security";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./android/**/*",
      "./app/**/*",
      "./components/**/*",
      "./coverage/**/*",
      "./docs/**/*",
      "./lib/**/*",
      "./prisma/**/*",
      "./scripts/**/*",
      "./storage/**/*",
      "./tests/**/*",
      "./AGENTS.md",
      "./CONTRIBUTING.md",
      "./Dockerfile",
      "./README.md",
      "./SECURITY.md",
      "./SECURITY_CHECKLIST.md",
      "./THIRD_PARTY_NOTICES.md",
      "./docker-compose.yml",
      "./eslint.config.mjs",
      "./instrumentation.ts",
      "./next.config.ts",
      "./package-lock.json",
      "./postcss.config.mjs",
      "./prisma.config.ts",
      "./proxy.ts",
      "./tsconfig.json",
      "./tsconfig.tsbuildinfo",
      "./vitest.config.ts",
    ],
  },
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
