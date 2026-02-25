import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["zhe.dev.hexly.ai"],

  // Replace Next.js's built-in polyfill-module with an empty shim.
  // These polyfills (Array.prototype.at, Object.fromEntries, Object.hasOwn,
  // etc.) are natively supported by all modern browsers we target, saving ~11 KiB.
  webpack(config, { isServer }) {
    config.resolve.alias["../build/polyfills/polyfill-module"] = path.resolve(
      "./lib/empty-polyfill.js"
    );

    // discord.js optionally requires zlib-sync (native addon) which is
    // unavailable in Vercel's serverless environment. Mark it as external
    // so webpack skips bundling it — discord.js falls back gracefully.
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("zlib-sync");
    }

    return config;
  },

  turbopack: {
    resolveAlias: {
      "../build/polyfills/polyfill-module": "./lib/empty-polyfill.js",
    },
  },
};

export default nextConfig;
