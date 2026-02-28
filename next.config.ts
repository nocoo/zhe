import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["zhe.dev.hexly.ai"],

  // Allow Server Actions from origin.zhe.to — the Worker proxies all traffic
  // from zhe.to through origin.zhe.to, and Railway's reverse proxy may rewrite
  // X-Forwarded-Host to origin.zhe.to, causing a mismatch with the browser's
  // Origin header (zhe.to). This whitelist tells Next.js to accept both.
  experimental: {
    serverActions: {
      allowedOrigins: ["origin.zhe.to"],
    },
  },

  // Replace Next.js's built-in polyfill-module with an empty shim.
  // These polyfills (Array.prototype.at, Object.fromEntries, Object.hasOwn,
  // etc.) are natively supported by all modern browsers we target, saving ~11 KiB.
  webpack(config) {
    config.resolve.alias["../build/polyfills/polyfill-module"] = path.resolve(
      "./lib/empty-polyfill.js"
    );

    return config;
  },

  turbopack: {
    resolveAlias: {
      "../build/polyfills/polyfill-module": "./lib/empty-polyfill.js",
    },
  },
};

export default nextConfig;
