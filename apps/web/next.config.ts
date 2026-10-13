import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // モノレポ内のパッケージは TypeScript ソースのまま読み込む
  transpilePackages: ["@devote/core", "@devote/db", "@devote/services"],
  images: { unoptimized: true },
  // クラウド開発環境で Playwright からアクセスする IP（開発時のみ有効）
  allowedDevOrigins: ["192.0.2.2"],
};

export default nextConfig;
