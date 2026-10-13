"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logout } from "@/app/account/actions";
import { HEADER_CTA, LEGAL, NAV } from "@/lib/copy";
import { Logo } from "./logo";
import { type HeaderState, headerState } from "./site-header-state";

const M = HEADER_CTA;
const LEGAL_LINKS = [
  { href: "/company", ja: LEGAL.footer.company },
  { href: "/privacy", ja: LEGAL.footer.privacy },
  { href: "/terms", ja: LEGAL.footer.terms },
] as const;

/**
 * springs.estate 風のヘッダー: 左にメニュー、中央にロゴ、右に CTA。
 * トップページではヒーロー（深緑）の上に透過で重ね、スクロールしたら生成りの面に切り替える。
 * 全画面メニューはネイティブの <dialog>（showModal）で開く: フォーカスの閉じ込め・Esc・背面の操作無効はブラウザに任せる。
 */
export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isChat = pathname.startsWith("/chat");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<HeaderState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 会員の状態（ログイン・確定したご希望）は画面を移るたびに確かめる（ご希望の確定直後に CTA を切り替える）
  useEffect(() => {
    let alive = true;
    headerState()
      .then((s) => alive && setMember(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const openMenu = useCallback(() => {
    const d = dialogRef.current;
    if (!d || d.open) return;
    d.showModal();
    document.documentElement.style.overflow = "hidden";
    setOpen(true);
  }, []);
  const closeMenu = useCallback(() => dialogRef.current?.close(), []);

  // Esc・閉じるボタン・リンクのいずれで閉じても、スクロールを戻してメニューのボタンへフォーカスを返す
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => {
      document.documentElement.style.overflow = "";
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  // 画面を移ったら閉じる（pathname の変化が合図）
  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  const overHero = isHome && !scrolled;
  const tone = overHero ? "dark" : "light";
  const text = tone === "dark" ? "text-sand-100" : "text-ink-900";
  const cta = member?.hasCondition
    ? { href: "/matches", label: M.member, short: NAV[1].ja }
    : { href: "/chat", label: M.guest, short: M.short };

  return (
    <>
      <header
        data-tone={tone}
        className={`fixed inset-x-0 top-0 z-40 transition-colors duration-700 ease-[var(--ease-luxe)] ${
          overHero ? "bg-transparent" : "border-b border-ink-900/10 bg-sand-50/90 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto grid h-[76px] max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-10">
          <div className="flex items-center gap-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={openMenu}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="site-menu"
              className={`group flex min-h-11 items-center gap-3 ${text}`}
            >
              <span aria-hidden className="flex w-7 flex-col gap-[6px] sm:w-8">
                <span className="h-px w-full bg-current" />
                <span className="h-px w-2/3 bg-current transition-all duration-500 group-hover:w-full" />
              </span>
              <span lang="en" className="eyebrow">
                {M.menu}
              </span>
              <span className="sr-only">（{M.menuOpen}）</span>
            </button>
            <nav className="hidden items-center gap-7 lg:flex" aria-label="主要メニュー">
              {NAV.slice(0, 2).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                  className={`text-[13px] tracking-[0.12em] transition-opacity hover:opacity-60 ${text} ${
                    pathname.startsWith(n.href) ? "underline underline-offset-8" : ""
                  }`}
                >
                  {n.ja}
                </Link>
              ))}
            </nav>
          </div>
          <Logo tone={tone} />
          <div className="flex items-center justify-end gap-6">
            <Link
              href="/settings"
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              className={`hidden text-[13px] tracking-[0.12em] transition-opacity hover:opacity-60 lg:inline ${text}`}
            >
              {NAV[3].ja}
            </Link>
            {!isChat && (
              <>
                {/* スマホ: 短い CTA（右上） */}
                <Link
                  href={cta.href}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 font-sans text-[12px] tracking-[0.12em] whitespace-nowrap sm:hidden ${
                    tone === "dark"
                      ? "border border-sand-200/50 text-sand-100"
                      : "bg-evergreen-800 text-sand-50"
                  }`}
                >
                  {cta.short}
                </Link>
                <Link
                  href={cta.href}
                  className={`hidden min-h-11 items-center rounded-full px-5 font-sans text-[12px] tracking-[0.14em] transition-colors duration-500 sm:inline-flex ${
                    tone === "dark"
                      ? "border border-sand-200/50 text-sand-100 hover:bg-sand-100 hover:text-evergreen-900"
                      : "bg-evergreen-800 text-sand-50 hover:bg-evergreen-900"
                  }`}
                >
                  {cta.label}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 全画面メニュー（モーダルの <dialog>） */}
      <dialog
        ref={dialogRef}
        id="site-menu"
        aria-label={M.menuLabel}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-evergreen-950 p-0 text-sand-100 opacity-0 transition-[opacity,overlay,display] transition-discrete duration-700 ease-[var(--ease-luxe)] backdrop:bg-transparent open:opacity-100 starting:open:opacity-0"
      >
        <div className="mx-auto flex min-h-full max-w-[1440px] flex-col px-5 sm:px-10">
          <div className="grid h-[76px] shrink-0 grid-cols-[1fr_auto_1fr] items-center">
            <button
              type="button"
              onClick={closeMenu}
              className="flex min-h-11 items-center gap-3 justify-self-start text-sand-100"
            >
              <span aria-hidden className="text-lg leading-none">
                ×
              </span>
              <span lang="en" className="eyebrow">
                {M.close}
              </span>
              <span className="sr-only">（{M.menuClose}）</span>
            </button>
            <Logo tone="dark" />
            <span />
          </div>
          <nav className="flex flex-1 flex-col justify-center py-6" aria-label={M.menuLabel}>
            <ul>
              {NAV.map((n, i) => (
                <li key={n.href} className="border-b border-sand-100/10">
                  <Link
                    href={n.href}
                    onClick={closeMenu}
                    aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                    className="group flex items-baseline gap-5 py-4 sm:gap-10 sm:py-5"
                  >
                    <span className="eyebrow w-6 shrink-0 text-sand-400">0{i + 1}</span>
                    <span className="display font-mincho text-[1.75rem] text-sand-100 transition-transform duration-700 ease-[var(--ease-luxe)] group-hover:translate-x-2 sm:text-5xl">
                      {n.ja}
                    </span>
                    <span lang="en" className="eyebrow ml-auto text-sand-300">
                      {n.en}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-6 border-t border-sand-100/10 py-8 sm:flex-row sm:items-center sm:justify-between">
            <ul className="flex flex-wrap gap-x-7 gap-y-1 text-[13px] text-sand-300">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={closeMenu}
                    className="inline-flex min-h-11 items-center transition-colors hover:text-sand-50"
                  >
                    {l.ja}
                  </Link>
                </li>
              ))}
            </ul>
            {member?.signedIn ? (
              <form action={logout}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-full border border-sand-200/50 px-6 text-[13px] tracking-[0.12em] text-sand-100 transition-colors duration-500 hover:bg-sand-100/10"
                >
                  {M.logout}
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                onClick={closeMenu}
                className="inline-flex min-h-11 items-center self-start rounded-full border border-sand-200/50 px-6 text-[13px] tracking-[0.12em] text-sand-100 transition-colors duration-500 hover:bg-sand-100/10"
              >
                {M.login}
              </Link>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
