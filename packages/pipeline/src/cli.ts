/**
 * バッチ処理の入口（GitHub Actions の定期実行から呼ぶ）。
 *
 *   pnpm worker crawl [sourceId...]   巡回（省略時は有効な全ソース）
 *   pnpm worker match                 マッチング
 *   pnpm worker notify                通知（送信に失敗した分があれば終了コード 1）
 *   pnpm worker all                   巡回 → マッチング → 通知
 *   pnpm worker sources               有効なソース一覧
 */
import { createDb } from "@devote/db";
import { enabledAdapters, retiredSourceIds } from "@devote/scraper";
import { runMatching, runNotifications } from "@devote/services";
import { loadCrawlScopes, runSource } from "./crawl.js";
import { closeRetiredSources } from "./retire.js";

const [command = "all", ...args] = process.argv.slice(2);
const db = createDb();

async function crawl(ids: string[]) {
  const all = enabledAdapters();
  const targets = ids.length > 0 ? all.filter((a) => ids.includes(a.meta.id)) : all;
  if (ids.length > 0 && targets.length !== ids.length) {
    const known = all.map((a) => a.meta.id).join(", ");
    throw new Error(`不明または無効なソース: ${ids.join(", ")}（有効: ${known}）`);
  }
  const retired = await closeRetiredSources(db, retiredSourceIds);
  if (retired > 0) console.log(`巡回をやめたソースの掲載を閉じました: ${retired} 件`);
  // 会員サイトの検索範囲（ユーザーの希望条件から作る）。バッチの最初に1度だけ読む
  const scopes = targets.some((a) => a.meta.scopedByConditions)
    ? await loadCrawlScopes(db)
    : undefined;
  if (scopes) {
    console.log(
      `会員サイトの検索範囲: ${scopes.length} 件 ${JSON.stringify(
        scopes.map((s) => ({
          deal: s.dealType,
          area: `${s.city}${s.town ?? ""}`,
          maxPrice: s.maxPrice,
          minArea: s.minAreaSqm,
          minRooms: s.minRooms,
        })),
      )}`,
    );
  }
  // サイト間は並列（同じサイトへのアクセスは各アダプターのレート制御で直列）
  const parallel = Number(process.env.DEVOTE_CRAWL_PARALLEL ?? 3);
  // 会員サイト（ログインあり）を先に回す。提供時間・利用枠があり、公開サイトの初回取り込みが長引いても遅らせないため
  const queue = [...targets].sort(
    (a, b) => Number(b.meta.requiresLogin) - Number(a.meta.requiresLogin),
  );
  const results: Awaited<ReturnType<typeof runSource>>[] = [];
  await Promise.all(
    Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        console.log(`▶ crawl ${a.meta.id}`);
        const r = await runSource(db, a, { scopes });
        console.log(JSON.stringify(r));
        results.push(r);
      }
    }),
  );
  return results;
}

/** 通知を送り、送信に失敗した分があればジョブを失敗にして気づけるようにする */
async function notify() {
  const summary = await runNotifications(db);
  console.log(JSON.stringify(summary));
  if (summary.failed > 0) process.exitCode = 1;
}

try {
  switch (command) {
    case "sources":
      for (const a of enabledAdapters()) console.log(`${a.meta.id}\t${a.meta.displayName}`);
      break;
    case "crawl": {
      const results = await crawl(args);
      // 失敗したソースがあればジョブを失敗にする（GitHub Actions では、その後の notify ジョブは続けて動く）
      if (results.some((r) => !r.ok)) process.exitCode = 1;
      break;
    }
    case "match":
      console.log(JSON.stringify(await runMatching(db)));
      break;
    case "notify":
      await notify();
      break;
    case "all": {
      const results = await crawl(args);
      console.log(JSON.stringify(await runMatching(db)));
      await notify();
      // 失敗したソースがあればジョブを失敗にして気づけるようにする（他のソースの結果は反映済み）
      if (results.some((r) => !r.ok)) process.exitCode = 1;
      break;
    }
    default:
      console.error(`unknown command: ${command}`);
      process.exitCode = 1;
  }
} finally {
  process.exit();
}
