import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingExcludes: {
    "/api/uploads/\\[name\\]": [
      "./app/**/*",
      "./components/**/*",
      "./db/**/*",
      "./docs/**/*",
      "./lib/**/*",
      "./patterns/**/*",
      "./public/**/*",
      "./tests/**/*",
      "./tools/**/*",
      "./*.md",
      "./*.ts",
      "./*.mjs",
      "./Dockerfile",
      "./compose.yaml",
    ],
  },
};

export default nextConfig;
