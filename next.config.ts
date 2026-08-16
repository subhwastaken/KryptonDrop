import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker/local images need standalone. Vercel injects an adapter
  // (`Applying modifyConfig from Vercel`); standalone + that adapter
  // fails the build after compile (missing next-server.js.nft.json).
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
