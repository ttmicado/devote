import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy。
 * Next.js はインラインのスクリプトを出力するため 'unsafe-inline' が必要（開発時は HMR のため 'unsafe-eval' も）。
 * フォントは Google Fonts、画像は物件写真（外部の https）を読む。
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
];

/** URL にトークンを含む画面: Referer で外部（Google Fonts 等）に漏らさず、キャッシュもしない */
const tokenPageHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  // モノレポ内のパッケージは TypeScript ソースのまま読み込む
  transpilePackages: ["@devote/core", "@devote/db", "@devote/services"],
  images: { unoptimized: true },
  // クラウド開発環境で Playwright からアクセスする IP（開発時のみ有効）
  allowedDevOrigins: ["192.0.2.2"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 同じキーは後の定義が優先される
      { source: "/session/switch", headers: tokenPageHeaders },
      { source: "/email/verify", headers: tokenPageHeaders },
      { source: "/api/session/claim", headers: tokenPageHeaders },
      { source: "/api/email/verify", headers: tokenPageHeaders },
    ];
  },
};

export default nextConfig;
