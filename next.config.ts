import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit `.next/standalone` for the Docker image we build in M1.
  output: "standalone",
};

export default nextConfig;
