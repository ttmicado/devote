// session.ts（next/headers を読む）に依存させず、テストから単体で使えるようにする
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * リダイレクト先を同じサイト内のパスに限る（オープンリダイレクト対策）。
 * `//evil.com` や `/\evil.com`、制御文字入りなど、ブラウザが別オリジンと解釈するものは fallback にする。
 */
export function safePath(next: string | null | undefined, fallback = "/matches"): string {
  if (!next || !next.startsWith("/")) return fallback;
  // URL パーサが黙って取り除く制御文字・空白やバックスラッシュを含むものは受け付けない
  if (/[\\\u0000-\u001f\u007f\s]/.test(next)) return fallback;
  try {
    const base = new URL(appUrl());
    const url = new URL(next, base);
    if (url.origin !== base.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
