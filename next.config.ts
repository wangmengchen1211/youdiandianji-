import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdf-to-png-converter depends on @napi-rs/canvas (native binding).
  // Turbopack can't bundle native modules, so mark these as server externals.
  serverExternalPackages: ["pdf-to-png-converter", "pdf-parse", "mammoth"],
};

export default nextConfig;
