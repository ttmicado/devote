import type { ReactNode } from "react";

/** 機能画面の共通の枠（固定ヘッダーの高さ分の余白＋最大幅） */
export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`mx-auto px-5 pt-[116px] pb-24 sm:px-10 sm:pt-[140px] ${wide ? "max-w-[1440px]" : "max-w-[1200px]"}`}
    >
      {children}
    </main>
  );
}
