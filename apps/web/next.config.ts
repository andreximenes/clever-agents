import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @clever/core ships TypeScript source; let Next transpile it.
  transpilePackages: ["@clever/core"],
  // Node-oriented libs used only in server code — don't bundle them.
  serverExternalPackages: [
    "unpdf",
    "xlsx",
    "mammoth",
    "postgres",
  ],
  experimental: {
    // Knowledge-base uploads (PDF/Excel/Word) go through Server Actions.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
