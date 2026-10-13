import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devote — 物件探しを、任せられる人へ。",
  description:
    "条件をひとこと伝えるだけ。業者間情報からデベロッパーの自社サイトまで、AIコンシェルジュが毎日くまなく見張り、あなたに合う一室だけを最速でお届けします。",
};

export const viewport: Viewport = {
  themeColor: "#142821",
  // iOS の safe-area（下部の固定ボタン）とキーボード表示時の高さ
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500&family=Shippori+Mincho:wght@400;500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
