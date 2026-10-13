"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HEADER_CTA, NAV } from "@/lib/copy";
import { Logo } from "./logo";

/**
 * springs.estate 風のヘッダー: 左にメニュー、中央にロゴ、右に CTA。
 * トップページではヒーロー（深緑）の上に透過で重ね、スクロールしたら生成りの面に切り替える。
 */
export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const overHero = isHome && !scrolled;
  const tone = overHero ? "dark" : "light";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-colors duration-700 ease-[var(--ease-luxe)] ${
          overHero ? "bg-transparent" : "border-b border-ink-900/10 bg-sand-50/90 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto grid h-[76px] max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-10">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="メニューを開く"
              aria-expanded={open}
              className={`group flex min-h-11 items-center gap-3 ${tone === "dark" ? "text-sand-100" : "text-ink-900"}`}
            >
              <span aria-hidden className="flex w-8 flex-col gap-[6px]">
                <span className="h-px w-full bg-current" />
                <span className="h-px w-2/3 bg-current transition-all duration-500 group-hover:w-full" />
              </span>
              <span className="eyebrow hidden sm:inline">Menu</span>
            </button>
            <nav className="hidden items-center gap-7 lg:flex" aria-label="主要メニュー">
              {NAV.slice(0, 2).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`eyebrow transition-opacity hover:opacity-60 ${
                    tone === "dark" ? "text-sand-100" : "text-ink-900"
                  } ${pathname.startsWith(n.href) ? "underline underline-offset-8" : ""}`}
                >
                  {n.en}
                </Link>
              ))}
            </nav>
          </div>
          <Logo tone={tone} />
          <div className="flex items-center justify-end gap-6">
            <Link
              href="/settings"
              className={`eyebrow hidden transition-opacity hover:opacity-60 lg:inline ${
                tone === "dark" ? "text-sand-100" : "text-ink-900"
              }`}
            >
              {NAV[3].en}
            </Link>
            <Link
              href="/chat"
              className={`hidden min-h-11 items-center rounded-full px-5 font-sans text-[12px] tracking-[0.14em] transition-colors duration-500 sm:inline-flex ${
                tone === "dark"
                  ? "border border-sand-200/50 text-sand-100 hover:bg-sand-100 hover:text-evergreen-900"
                  : "bg-evergreen-800 text-sand-50 hover:bg-evergreen-900"
              }`}
            >
              {HEADER_CTA.guest}
            </Link>
          </div>
        </div>
      </header>

      {/* 全画面メニュー */}
      <div
        className={`fixed inset-0 z-50 bg-evergreen-950 text-sand-100 transition-[opacity,visibility] duration-700 ease-[var(--ease-luxe)] ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="メニュー"
      >
        <div className="mx-auto flex h-full max-w-[1440px] flex-col px-5 sm:px-10">
          <div className="grid h-[76px] grid-cols-[1fr_auto_1fr] items-center">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="eyebrow flex min-h-11 items-center gap-3 text-sand-100"
            >
              <span aria-hidden className="text-lg leading-none">
                ×
              </span>{" "}
              Close
            </button>
            <Logo tone="dark" />
            <span />
          </div>
          <nav className="flex flex-1 flex-col justify-center gap-2" aria-label="メニュー">
            {NAV.map((n, i) => (
              <Link
                key={n.href}
                href={n.href}
                className="group flex items-baseline gap-6 border-b border-sand-100/10 py-5 sm:gap-10"
                style={{ transitionDelay: open ? `${i * 60}ms` : "0ms" }}
              >
                <span className="eyebrow w-8 text-sand-400">0{i + 1}</span>
                <span className="display text-4xl font-light text-sand-100 transition-transform duration-700 ease-[var(--ease-luxe)] group-hover:translate-x-2 sm:text-6xl">
                  {n.en}
                </span>
                <span className="font-mincho text-sm text-sand-300 sm:text-base">{n.ja}</span>
              </Link>
            ))}
          </nav>
          <p className="eyebrow pb-10 text-sand-400">
            Minato · Shibuya · Chiyoda · Shinagawa · Kachidoki · Toyosu
          </p>
        </div>
      </div>
    </>
  );
}
