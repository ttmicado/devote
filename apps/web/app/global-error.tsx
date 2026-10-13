"use client";

import { ERRORS } from "@/lib/copy";
import "./globals.css";

const E = ERRORS.error;

/** ルートのレイアウトごと表示できなかったとき（自前の html / body を持つ最小の画面） */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body className="flex min-h-screen items-center justify-center bg-sand-50 px-5 text-ink-900">
        <main className="max-w-md text-center">
          <p className="eyebrow text-sand-600">{E.eyebrow}</p>
          <h1 className="display mt-4 font-mincho text-2xl text-evergreen-900">{E.title}</h1>
          <p className="mt-4 text-sm leading-7 text-ink-500">{E.body}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center rounded-full bg-evergreen-800 px-6 text-[13px] tracking-[0.12em] text-sand-50 hover:bg-evergreen-900"
            >
              {E.retry}
            </button>
            <a
              href="/"
              className="inline-flex min-h-11 items-center rounded-full border border-ink-900/30 px-6 text-[13px] tracking-[0.12em] text-ink-900"
            >
              {E.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
