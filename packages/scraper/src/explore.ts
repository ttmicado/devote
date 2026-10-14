/**
 * 会員サイト（レインズ / ATBB / ITANDI BB）の画面遷移を記録する探索スクリプト。
 *
 *   npx tsx packages/scraper/src/explore.ts <reins|atbb|itandi-bb> [--headed] [--logout] [--fresh]
 *
 * ログイン → 検索画面 → 港区の賃貸で検索 → 一覧 → 詳細1件 の各ステップで、スクリーンショットと
 * HTML を storage/explore/<source>/ に保存する（captureStep）。XHR/fetch の通信一覧も
 * storage/explore/<source>/network.jsonl に残す（内部 API の発見用。リクエスト本文は保存しない）。
 * ログインできたらセッションを storage/sessions/<source>.json に保存し、次回はそれを使う。
 *
 *   --headed  ブラウザを表示する（2段階認証・CAPTCHA が出たときに人が様子を見る用）
 *   --logout  終了時にログアウトする（同時ログイン不可のサイトで人の作業を邪魔しないため）
 *   --fresh   保存済みセッションを使わずにログインし直す
 *   --precheck-only  レインズ用。件数事前確認（無課金）で止め、一覧の表示（課金対象）はしない
 *   --query=KEY      検索条件のキー（adapter.queries() の key。例 rent-中央区勝どき）
 *   --details=N      詳細を開く件数（既定1）
 *   --pages=N        一覧を N ページ目まで送り、詳細は最後のページから開く
 *   --logout-only    ログイン（保存セッションがあれば再利用）してすぐログアウトする
 *   --usage          レインズ用。ログイン後に Myレインズの利用実績照会を記録して終わる
 *   --pick=I,J       一覧の I 件目・J 件目（0始まり）の詳細を開く
 *   --max-count=N    レインズ用。事前確認の件数が N 件（既定100）を超えたら検索しない
 *
 * 注意: 認証情報は環境変数から読む（.env を `node --env-file=.env` 等で読み込む）。
 *       保存される HTML/スクショ/セッションには会員情報が含まれるので storage/ はコミットしない（.gitignore 済み）。
 */
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import type { ListItem, SiteAdapter } from "./adapter.js";
import atbb, * as atbbModule from "./adapters/atbb/index.js";
import itandiBb, * as itandiModule from "./adapters/itandi-bb/index.js";
import reins, * as reinsModule from "./adapters/reins/index.js";
import { type BrowserFetchContext, captureStep, createBrowserFetchContext } from "./browser.js";

interface Target {
  adapter: SiteAdapter;
  hooks: {
    onStep?: (step: string, page?: Page) => Promise<void>;
    precheckOnly?: boolean;
    maxSearchCount?: number;
    onBack?: (activePage: string, expected: number) => Promise<void>;
    onDetail?: (
      id: string,
      html: string,
      url: string,
      popup: boolean,
      from: string,
    ) => Promise<void>;
  };
  /** ログアウト手順（分かっている範囲で。失敗しても無視） */
  logout: (ctx: BrowserFetchContext) => Promise<void>;
}

const TARGETS: Record<string, Target> = {
  reins: {
    adapter: reins,
    hooks: reinsModule.hooks,
    // ログイン画面の JS: POST main/api/logout → /logout/main/KG/GKG002100。画面のメニューから押すのが確実
    logout: async (ctx) => {
      // 件数事前確認などのモーダルが開いているとメニューを押せないので閉じてから
      await ctx.page.keyboard.press("Escape").catch(() => undefined);
      await ctx.page.waitForTimeout(500);
      await ctx.page.getByText("ログアウト", { exact: true }).first().click({ timeout: 5_000 });
      // 確認ダイアログが出る場合は OK / はい / ログアウト を押す
      await ctx.page
        .getByRole("dialog")
        .getByRole("button", { name: /^(OK|はい|ログアウト)$/ })
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
      await ctx.page.waitForURL(/\/logout\/|\/login\//, { timeout: 15_000 });
    },
  },
  atbb: {
    adapter: atbb,
    hooks: atbbModule.hooks,
    // ポータル（members.athome.jp/portal）右上の「ログアウト」（form POST /logout）
    logout: async (ctx) => {
      if (!ctx.page.url().startsWith("https://members.athome.jp/portal")) {
        await ctx.page.goto("https://members.athome.jp/portal", { waitUntil: "domcontentloaded" });
      }
      await Promise.all([
        ctx.page.waitForNavigation({ timeout: 30_000 }).catch(() => undefined),
        ctx.page.locator(".c-util__menu__logout button").first().click({ timeout: 10_000 }),
      ]);
    },
  },
  "itandi-bb": {
    adapter: itandiBb,
    hooks: itandiModule.hooks,
    // 右上の会社名メニュー内の「ログアウト」ボタン（メニューは閉じていても DOM にあるので click イベントを送る）
    logout: async (ctx) => {
      await ctx.page
        .locator("button", { hasText: /^ログアウト$/ })
        .first()
        .dispatchEvent("click", undefined, { timeout: 10_000 });
      await ctx.page.waitForURL(/itandi-accounts\.com|\/login/, { timeout: 20_000 });
    },
  },
};

const [source, ...flags] = process.argv.slice(2);
const target = source ? TARGETS[source] : undefined;
if (!source || !target) {
  console.error(
    `usage: npx tsx packages/scraper/src/explore.ts <${Object.keys(TARGETS).join("|")}> [--headed] [--logout] [--fresh]`,
  );
  process.exit(1);
}
const { adapter } = target;

const outDir = join(process.cwd(), "storage", "explore", source);
const sessionPath = join(process.cwd(), "storage", "sessions", `${source}.json`);
mkdirSync(outDir, { recursive: true });
if (flags.includes("--fresh") && existsSync(sessionPath)) rmSync(sessionPath);

const log = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(outDir, "explore.log"), `${line}\n`);
};

const ctx = await createBrowserFetchContext(adapter.meta, {
  storageStatePath: sessionPath,
  headless: !flags.includes("--headed"),
  // 写真の URL を確認したいので画像はブロックしない
  blockMedia: false,
});

// 内部 API の発見用に XHR/fetch を記録（リクエスト本文・認証系のレスポンス本文は保存しない）
let seq = 0;
ctx.context.on("response", async (res) => {
  const req = res.request();
  if (!["xhr", "fetch"].includes(req.resourceType())) return;
  const url = res.url();
  const contentType = res.headers()["content-type"] ?? "";
  const entry: Record<string, unknown> = {
    at: new Date().toISOString(),
    method: req.method(),
    url,
    status: res.status(),
    contentType,
  };
  const sensitive = /login|logout|token|session|auth|password|uuid/i.test(url);
  if (!sensitive && contentType.includes("json")) {
    try {
      const body = await res.text();
      if (body.length < 2_000_000) {
        const file = `api-${String(++seq).padStart(3, "0")}.json`;
        writeFileSync(join(outDir, file), body);
        entry.savedAs = file;
      }
    } catch {
      // レスポンス本文が取れない（リダイレクト等）
    }
  }
  appendFileSync(join(outDir, "network.jsonl"), `${JSON.stringify(entry)}\n`);
});

let stepNo = 0;
const capture = async (name: string, page: Page = ctx.page) => {
  const label = `${String(++stepNo).padStart(2, "0")}-${name}`;
  try {
    const base = await captureStep(page, source, label);
    log(`captured ${label} (${page.url()}) → ${base}.{png,html}`);
  } catch (e) {
    log(`capture failed ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
};
// 別タブで操作するサイト（ATBB）は、直近のステップのページを失敗時の記録にも使う
let lastStepPage: Page | undefined;
target.hooks.onStep = async (name, page) => {
  if (page && !page.isClosed()) lastStepPage = page;
  await capture(name, page && !page.isClosed() ? page : ctx.page);
};
// レインズは【検索】の一覧表示から課金対象。--precheck-only なら件数事前確認（無課金）までで止める
if (flags.includes("--precheck-only")) target.hooks.precheckOnly = true;
target.hooks.onDetail = async (id, _html, url, popup, from) => {
  log(`detail ${id}: ${popup ? "別タブ" : "同じタブ"} ${from} → ${url}`);
};
target.hooks.onBack = async (active, expected) => {
  log(`一覧に戻った: 表示中のページ ${active}（期待 ${expected}）`);
};
// 事前確認の件数が多すぎる検索はしない（既定 100件。--max-count=N で変更）
target.hooks.maxSearchCount = Number(
  flags.find((f) => f.startsWith("--max-count="))?.split("=")[1] ?? 100,
);

/** 1ステップを実行し、失敗したらその時点の画面を保存する。fatal なら終了 */
async function runStep<T>(
  name: string,
  fn: () => Promise<T>,
  fatal: boolean,
): Promise<T | undefined> {
  log(`step: ${name}`);
  try {
    return await fn();
  } catch (e) {
    log(`FAILED ${name}: ${e instanceof Error ? e.message : String(e)}`);
    await capture(
      `${name}-failed`,
      lastStepPage && !lastStepPage.isClosed() ? lastStepPage : ctx.page,
    );
    if (fatal) {
      await finish(1);
    }
    return undefined;
  }
}

async function finish(code: number): Promise<never> {
  if (flags.includes("--logout")) {
    await target?.logout(ctx).catch((e) => log(`logout failed: ${String(e)}`));
    await capture("logout");
  }
  await ctx.close();
  // ログアウトしたセッションを残すと、次回の起動時に無効なトークンで画面が乱れる
  if (flags.includes("--logout") && existsSync(sessionPath)) rmSync(sessionPath);
  log(`done (exit ${code}). 出力: ${outDir}`);
  process.exit(code);
}

// 0) 認証情報の確認（未設定ならブラウザ操作の前に止める。ログイン試行はしない）
const loginModule = { reins: reinsModule, atbb: atbbModule, "itandi-bb": itandiModule }[source];
try {
  loginModule?.credentials();
} catch (e) {
  log(e instanceof Error ? e.message : String(e));
  await ctx.close();
  process.exit(2);
}

// 1) ログイン
await runStep(
  "login",
  async () => {
    if (!adapter.login) throw new Error("login が未実装");
    await adapter.login(ctx);
    await capture("after-login");
    await ctx.saveSession();
    log(`session saved → ${sessionPath}`);
  },
  true,
);

// 1a) --logout-only: ログイン状態を確認してログアウトするだけ（セッションを残したときの後始末）
if (flags.includes("--logout-only")) await finish(0);

// 1b) レインズ: --usage なら Myレインズの「利用実績照会」を記録して終わる（課金件数の確認用）
if (source === "reins" && flags.includes("--usage")) {
  await runStep(
    "usage",
    async () => {
      await ctx.page
        .getByRole("button", { name: /利用実績照会/ })
        .first()
        .click();
      await ctx.page.waitForLoadState("networkidle").catch(() => undefined);
      await ctx.page.waitForTimeout(2_000);
      await capture("usage");
      log((await ctx.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 3000));
    },
    false,
  );
  await finish(0);
}

// 2) 検索（港区・賃貸）→ 一覧
// --query=<key>（例 rent-中央区勝どき）で検索条件を選べる。既定は港区の賃貸
const queryKey = flags.find((f) => f.startsWith("--query="))?.split("=")[1];
const query = adapter
  .queries()
  .find((q) =>
    queryKey
      ? q.key === queryKey
      : q.params.city === "港区" && (q.params.deal ?? "rent") === "rent",
  );
if (!query) await finish(1);
const listUrl = adapter.buildListUrl(query as NonNullable<typeof query>);
const listBody = await runStep(
  "search-and-list",
  async () => {
    if (!adapter.fetchList) throw new Error("fetchList が未実装");
    const body = await adapter.fetchList(ctx, listUrl);
    writeFileSync(
      join(outDir, `list-body.${body.trimStart().startsWith("{") ? "json" : "html"}`),
      body,
    );
    return body;
  },
  true,
);
if (source === "reins") log(`件数事前確認: ${reinsModule.lastPrecheckCount} 件`);
await ctx.saveSession();

// 2b) --pages=N なら N ページ目まで一覧を送る（詳細は最後のページから選ぶ）
let pageUrl = listUrl;
let pageBody = listBody;
const maxPagesFlag = Number(flags.find((f) => f.startsWith("--pages="))?.split("=")[1] ?? 1);
for (let n = 2; n <= maxPagesFlag && pageBody; n++) {
  const next = adapter.parseList(pageBody, pageUrl).nextPageUrl;
  if (!next || !adapter.fetchList) break;
  const nextUrl = next;
  pageBody = await runStep(`list-page-${n}`, () => adapter.fetchList!(ctx, nextUrl), false);
  pageUrl = nextUrl;
  if (pageBody) writeFileSync(join(outDir, `list-body-${n}.json`), pageBody);
}

// 3) 一覧のパース（失敗しても続行: 構造の確認材料は保存済み）
const detailLimit = Number(flags.find((f) => f.startsWith("--details="))?.split("=")[1] ?? 1);
let picked: ListItem[] = [];
await runStep(
  "parse-list",
  async () => {
    const r = adapter.parseList(pageBody ?? "", pageUrl);
    log(`parseList: items=${r.items.length} total=${r.totalCount} next=${r.nextPageUrl}`);
    writeFileSync(join(outDir, "list-parsed.json"), JSON.stringify(r, null, 2));
    // --pick=0,60 で一覧の何件目（0始まり）の詳細を開くか指定できる（ページ送りの確認用）
    const pick = flags.find((f) => f.startsWith("--pick="))?.split("=")[1];
    picked = pick
      ? pick
          .split(",")
          .map((i) => r.items[Number(i)])
          .filter((i): i is ListItem => i != null)
      : r.items.slice(0, detailLimit);
  },
  false,
);

// 4) 詳細（既定1件。--details=N）
for (const [i, item] of picked.entries()) {
  const n = i + 1;
  const detailBody = await runStep(
    `detail-${n}`,
    async () => {
      const body = adapter.fetchDetail
        ? await adapter.fetchDetail(ctx, item)
        : (await ctx.get(item.detailUrl)).body;
      writeFileSync(
        join(outDir, `detail-${n}-body.${body.trimStart().startsWith("{") ? "json" : "html"}`),
        body,
      );
      return body;
    },
    false,
  );
  if (!detailBody) continue;
  await runStep(
    `parse-detail-${n}`,
    async () => {
      const raw = adapter.parseDetail(detailBody, item.detailUrl);
      log(`parseDetail: fields=${Object.keys(raw.fields).length} images=${raw.imageUrls.length}`);
      writeFileSync(join(outDir, `detail-${n}-parsed.json`), JSON.stringify(raw, null, 2));
      const normalized = adapter.normalize(raw);
      writeFileSync(
        join(outDir, `detail-${n}-normalized.json`),
        JSON.stringify(normalized, null, 2),
      );
      log("normalize: OK");
    },
    false,
  );
}
if (picked.length === 0) {
  log("一覧から物件が取れなかったため詳細はスキップ（list-body と画面キャプチャで構造を確認する）");
}

await ctx.saveSession();
await finish(0);
