import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devote — あなたにピッタリの物件を最速で",
  description: "あなたにピッタリ合う物件を、最速で・手間なく・くまなく提案してくれるAI",
};

const NAV = [
  { href: "/chat", label: "AIに相談" },
  { href: "/matches", label: "おすすめ物件" },
  { href: "/inquiries", label: "問い合わせ" },
  { href: "/settings", label: "通知設定" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link href="/" className="text-xl font-black tracking-tight text-brand-700">
              Devote
            </Link>
            <nav className="flex gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-stone-700 hover:bg-stone-100"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-10 text-xs text-stone-400">© Devote</footer>
      </body>
    </html>
  );
}
