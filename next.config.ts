import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.PLAYWRIGHT === "1" ? {} : { output: "standalone" as const }),
  // L2/L3 run beside the user's dev server without sharing its cache or lock.
  distDir:
    process.env.ZHE_LAUNCH_INTENT === "interactive"
      ? ".next-local"
      : process.env.PLAYWRIGHT === "1"
        ? `.next-test/${process.env.ZHE_RUN_ID}`
        : ".next",
  ...(process.env.ZHE_TEST_TSCONFIG
    ? { typescript: { tsconfigPath: process.env.ZHE_TEST_TSCONFIG } }
    : {}),
  allowedDevOrigins: ["zhe.dev.hexly.ai"],

  // The Worker proxies zhe.to traffic through origin.zhe.to, and the proxy in
  // front of the container rewrites X-Forwarded-Host to origin.zhe.to while the
  // browser's Origin header stays zhe.to. Next.js rejects that mismatch, so
  // allowedOrigins trusts the browser's origin domain.
  experimental: {
    serverActions: {
      allowedOrigins: ["zhe.to"],
    },
  },

  // Replace Next.js's built-in polyfill-module with an empty shim.
  // These polyfills (Array.prototype.at, Object.fromEntries, Object.hasOwn,
  // etc.) are natively supported by all modern browsers we target, saving ~11 KiB.
  webpack(config) {
    config.resolve.alias["../build/polyfills/polyfill-module"] =
      path.resolve("./lib/empty-polyfill.js");

    return config;
  },

  turbopack: {
    resolveAlias: {
      "../build/polyfills/polyfill-module": "./lib/empty-polyfill.js",
    },
  },
};

export default nextConfig;
