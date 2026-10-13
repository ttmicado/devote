import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // モノレポ内のパッケージは TypeScript ソースのまま読み込む
  transpilePackages: ["@devote/core", "@devote/db", "@devote/services"],
  images: { unoptimized: true },
};

export default nextConfig;
