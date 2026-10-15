import type { FetchContext, SourceMeta } from "./adapter.js";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 DevoteBot/0.1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ソース単位のレート制御付き HTTP フェッチャー。
 * - 直前のリクエストから minIntervalMs 空ける（＋ジッタ）
 * - ネットワークエラー・429・5xx は指数バックオフでリトライ。404/410 はそのまま返す（掲載終了候補）
 *
 * 複数ワーカーで動かす段階になったら、間隔管理を DB/Redis の共有トークンバケットに置き換える。
 */
export function createHttpFetcher(
  meta: Pick<SourceMeta, "rateLimit">,
  opts: { maxRetries?: number; fetchImpl?: typeof fetch } = {},
): FetchContext {
  const { maxRetries = 3, fetchImpl = fetch } = opts;
  let lastRequestAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function throttle() {
    const jitter = Math.random() * meta.rateLimit.minIntervalMs * 0.3;
    const wait = lastRequestAt + meta.rateLimit.minIntervalMs + jitter - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  }

  async function get(url: string) {
    for (let attempt = 0; ; attempt++) {
      await throttle();
      try {
        const res = await fetchImpl(url, {
          headers: { "user-agent": USER_AGENT, "accept-language": "ja,en;q=0.8" },
          redirect: "follow",
        });
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        const body = decodeBody(await res.arrayBuffer(), res.headers.get("content-type"));
        return { status: res.status, body, url: res.url || url };
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        await sleep(2 ** attempt * 1000);
      }
    }
  }

  return {
    // 同一ソース内のリクエストは直列化して間隔を守る（maxConcurrency=1 前提の初期実装）
    get: (url) => {
      const p = queue.then(() => get(url));
      queue = p.catch(() => undefined);
      return p;
    },
  };
}

/**
 * レスポンス本文を文字列にする。Shift_JIS のサイト（住友不動産ステップ等）があるため、
 * Content-Type の charset → HTML 先頭の <meta charset> の順に文字コードを決める（既定 UTF-8）。
 */
export function decodeBody(buf: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buf);
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const label = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * Playwright でブラウザを起動する。
 * クラウド開発環境ではプリインストール済み Chromium（PLAYWRIGHT_BROWSERS_PATH）を使うため
 * playwright のバージョンは package.json で固定している。
 */
export async function launchBrowser() {
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}
