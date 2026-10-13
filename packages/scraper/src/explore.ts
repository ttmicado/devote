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
 *
 * 注意: 認証情報は環境変数から読む（.env を `node --env-file=.env` 等で読み込む）。
 *       保存される HTML/スクショ/セッションには会員情報が含まれるので storage/ はコミットしない（.gitignore 済み）。
 */
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListItem, SiteAdapter } from "./adapter.js";
import atbb, * as atbbModule from "./adapters/atbb/index.js";
import itandiBb, * as itandiModule from "./adapters/itandi-bb/index.js";
import reins, * as reinsModule from "./adapters/reins/index.js";
import { type BrowserFetchContext, captureStep, createBrowserFetchContext } from "./browser.js";

interface Target {
  adapter: SiteAdapter;
  hooks: { onStep?: (step: string) => Promise<void> };
  /** ログアウト手順（分かっている範囲で。失敗しても無視） */
  logout: (ctx: BrowserFetchContext) => Promise<void>;
}

const TARGETS: Record<string, Target> = {
  reins: {
    adapter: reins,
    hooks: reinsModule.hooks,
    // ログイン画面の JS: POST main/api/logout → /logout/main/KG/GKG002100。画面のメニューから押すのが確実
    logout: async (ctx) => {
      await ctx.page.getByText("ログアウト").first().click({ timeout: 5_000 });
    },
  },
  atbb: {
    adapter: atbb,
    hooks: atbbModule.hooks,
    logout: async (ctx) => {
      await ctx.page.getByText("ログアウト").first().click({ timeout: 5_000 }); // TODO(verify)
    },
  },
  "itandi-bb": {
    adapter: itandiBb,
    hooks: itandiModule.hooks,
    logout: async (ctx) => {
      await ctx.page.getByText("ログアウト").first().click({ timeout: 5_000 }); // TODO(verify)
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
const capture = async (name: string) => {
  const label = `${String(++stepNo).padStart(2, "0")}-${name}`;
  try {
    const base = await captureStep(ctx.page, source, label);
    log(`captured ${label} (${ctx.page.url()}) → ${base}.{png,html}`);
  } catch (e) {
    log(`capture failed ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
};
target.hooks.onStep = capture;

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
    await capture(`${name}-failed`);
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

// 2) 検索（港区・賃貸）→ 一覧
const query = adapter
  .queries()
  .find((q) => q.params.city === "港区" && (q.params.deal ?? "rent") === "rent");
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
await ctx.saveSession();

// 3) 一覧のパース（失敗しても続行: 構造の確認材料は保存済み）
let first: ListItem | undefined;
await runStep(
  "parse-list",
  async () => {
    const r = adapter.parseList(listBody ?? "", listUrl);
    log(`parseList: items=${r.items.length} total=${r.totalCount} next=${r.nextPageUrl}`);
    first = r.items[0];
  },
  false,
);

// 4) 詳細1件
if (first) {
  const item = first;
  const detailBody = await runStep(
    "detail",
    async () => {
      const body = adapter.fetchDetail
        ? await adapter.fetchDetail(ctx, item)
        : (await ctx.get(item.detailUrl)).body;
      writeFileSync(
        join(outDir, `detail-body.${body.trimStart().startsWith("{") ? "json" : "html"}`),
        body,
      );
      return body;
    },
    false,
  );
  if (detailBody) {
    await runStep(
      "parse-detail",
      async () => {
        const raw = adapter.parseDetail(detailBody, item.detailUrl);
        log(`parseDetail: fields=${Object.keys(raw.fields).length} images=${raw.imageUrls.length}`);
        writeFileSync(join(outDir, "detail-parsed.json"), JSON.stringify(raw, null, 2));
        const n = adapter.normalize(raw);
        writeFileSync(join(outDir, "detail-normalized.json"), JSON.stringify(n, null, 2));
        log("normalize: OK");
      },
      false,
    );
  }
} else {
  log("一覧から物件が取れなかったため詳細はスキップ（list-body と画面キャプチャで構造を確認する）");
}

await ctx.saveSession();
await finish(0);
