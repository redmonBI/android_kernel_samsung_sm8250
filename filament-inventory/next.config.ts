import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
