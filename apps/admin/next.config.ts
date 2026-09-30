import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This repository has separate root and admin npm lockfiles. Pin Turbopack
  // to the standalone app so it does not infer the repository root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
