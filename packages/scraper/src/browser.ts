import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { FetchContext, SourceMeta } from "./adapter.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BrowserFetchContext extends FetchContext {
  page: Page;
  context: BrowserContext;
  /** ログイン状態（cookie / localStorage）を保存する */
  saveSession(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Playwright による FetchContext。
 * - get(url) はページ遷移して描画後の HTML を返す（SPA・JS描画サイト用）
 * - storageStatePath にセッションを保存・復元し、毎回ログインしないようにする
 * - 画像・フォント・動画はブロックして高速化する（写真は URL だけ取得する）
 */
export async function createBrowserFetchContext(
  meta: Pick<SourceMeta, "rateLimit" | "id">,
  opts: { storageStatePath?: string; headless?: boolean; blockMedia?: boolean } = {},
): Promise<BrowserFetchContext> {
  const { chromium } = await import("playwright");
  const browser: Browser = await chromium.launch({ headless: opts.headless ?? true });
  const statePath = opts.storageStatePath;
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1366, height: 900 },
    storageState: statePath && existsSync(statePath) ? statePath : undefined,
  });
  if (opts.blockMedia ?? true) {
    await context.route("**/*", (route) =>
      ["image", "font", "media"].includes(route.request().resourceType())
        ? route.abort()
        : route.continue(),
    );
  }
  const page = await context.newPage();
  let lastRequestAt = 0;

  return {
    page,
    context,
    async get(url) {
      const wait = lastRequestAt + meta.rateLimit.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      return { status: res?.status() ?? 0, body: await page.content(), url: page.url() };
    },
    async saveSession() {
      if (!statePath) return;
      mkdirSync(dirname(statePath), { recursive: true });
      await context.storageState({ path: statePath });
    },
    async close() {
      await browser.close();
    },
  };
}

/** 調査・デバッグ用: 現在の画面のスクリーンショットと HTML を storage/explore/<source>/ に保存 */
export async function captureStep(page: Page, source: string, step: string): Promise<string> {
  const dir = join(process.cwd(), "storage", "explore", source);
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${String(Date.now())}-${step}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  writeFileSync(`${base}.html`, await page.content());
  return base;
}
