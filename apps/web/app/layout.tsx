import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { HEADER_CTA } from "@/lib/copy";
import { BASE_OPEN_GRAPH, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/seo";
import "./globals.css";

/*
 * 書体は next/font で自己ホストする（Google Fonts への接続待ちをなくす）。
 * 欧文（Cormorant・Jost）は先読みし、和文（Shippori・Zen Kaku）は unicode-range の分割ファイルを
 * 必要な文字の分だけ読むため先読みしない。
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant",
});
const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jost",
});
const shippori = Shippori_Mincho({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-shippori",
});
const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
  variable: "--font-zen-kaku",
});

/**
 * サイト共通のメタデータ。canonical と og:url は子のページに継承されると誤るため、各ページで指定する
 * （トップは app/page.tsx）。OG 画像は app/opengraph-image.png を全ページで使う。
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s｜${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: BASE_OPEN_GRAPH,
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#142821",
  // iOS の safe-area（下部の固定ボタン）とキーボード表示時の高さ
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${cormorant.variable} ${jost.variable} ${shippori.variable} ${zenKaku.variable}`}
    >
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only z-[60] rounded-full bg-evergreen-900 px-5 py-3 text-sm text-sand-50 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {HEADER_CTA.skip}
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
