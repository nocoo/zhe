import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["zhe.dev.hexly.ai"],

  webpack(config) {
    // Replace Next.js's built-in polyfill-module with an empty shim.
    // These polyfills (Array.prototype.at, Object.fromEntries, Object.hasOwn,
    // etc.) are natively supported by all modern browsers we target, saving ~11 KiB.
    config.resolve.alias["../build/polyfills/polyfill-module"] = path.resolve(
      "./lib/empty-polyfill.js"
    );
    return config;
  },
};

export default nextConfig;
