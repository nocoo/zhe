import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["zhe.dev.hexly.ai"],

  // The Worker proxies zhe.to traffic through origin.zhe.to. Railway rewrites
  // X-Forwarded-Host to origin.zhe.to, but the browser's Origin header is zhe.to.
  // Next.js compares these and rejects when they differ. allowedOrigins tells
  // Next.js to trust the browser's origin domain (zhe.to) despite the mismatch.
  experimental: {
    serverActions: {
      allowedOrigins: ["zhe.to"],
    },
  },

  // CI runs `tsc --noEmit` as a dedicated type-check step which correctly
  // respects tsconfig.json `exclude: ["cli"]`. next build's built-in checker
  // ignores the exclude and scans cli/, failing on cli-only deps like
  // @nocoo/cli-base. Skip the redundant (and broken) check here.
  typescript: {
    ignoreBuildErrors: true,
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
