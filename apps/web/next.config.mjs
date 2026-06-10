import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // Force webpack to use the TypeScript source of @marine/shared rather than
    // the pre-built CommonJS dist. Applied to both server and client bundles:
    // the CJS dist uses __exportStar(require("./types")) which webpack cannot
    // statically trace, causing named exports like SystemIntegrityStatus to be
    // tree-shaken out of the client bundle.
    // Must list subpath before the bare specifier to prevent prefix matching.
    if (isServer) {
      config.resolve.alias["@marine/shared/server"] = path.resolve(
        __dirname,
        "../../packages/shared/src/server.ts"
      );
    }
    config.resolve.alias["@marine/shared"] = path.resolve(
      __dirname,
      "../../packages/shared/src/index.ts"
    );
    // Disable used-exports and inner-graph tree-shaking on all bundles.
    // Without this, webpack removes TypeScript enum IIFE runtime values from
    // @marine/shared/src/types.ts because it cannot prove the enum objects
    // (which are assigned via IIFE side effects) are "used" named exports.
    config.optimization.usedExports = false;
    config.optimization.innerGraph = false;
    return config;
  },
};

export default nextConfig;
