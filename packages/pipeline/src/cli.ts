/**
 * バッチ処理の入口（GitHub Actions の定期実行から呼ぶ）。
 *
 *   pnpm worker crawl [sourceId...]   巡回（省略時は有効な全ソース）
 *   pnpm worker match                 マッチング
 *   pnpm worker notify                通知
 *   pnpm worker all                   巡回 → マッチング → 通知
 *   pnpm worker sources               有効なソース一覧
 */
import { createDb } from "@devote/db";
import { enabledAdapters } from "@devote/scraper";
import { runMatching, runNotifications } from "@devote/services";
import { runSource } from "./crawl.js";

const [command = "all", ...args] = process.argv.slice(2);
const db = createDb();

async function crawl(ids: string[]) {
  const all = enabledAdapters();
  const targets = ids.length > 0 ? all.filter((a) => ids.includes(a.meta.id)) : all;
  if (ids.length > 0 && targets.length !== ids.length) {
    const known = all.map((a) => a.meta.id).join(", ");
    throw new Error(`不明または無効なソース: ${ids.join(", ")}（有効: ${known}）`);
  }
  // サイト間は並列（同じサイトへのアクセスは各アダプターのレート制御で直列）
  const parallel = Number(process.env.DEVOTE_CRAWL_PARALLEL ?? 3);
  const queue = [...targets];
  const results: Awaited<ReturnType<typeof runSource>>[] = [];
  await Promise.all(
    Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        console.log(`▶ crawl ${a.meta.id}`);
        const r = await runSource(db, a);
        console.log(JSON.stringify(r));
        results.push(r);
      }
    }),
  );
  return results;
}

try {
  switch (command) {
    case "sources":
      for (const a of enabledAdapters()) console.log(`${a.meta.id}\t${a.meta.displayName}`);
      break;
    case "crawl":
      await crawl(args);
      break;
    case "match":
      console.log(JSON.stringify(await runMatching(db)));
      break;
    case "notify":
      console.log(JSON.stringify(await runNotifications(db)));
      break;
    case "all": {
      const results = await crawl(args);
      console.log(JSON.stringify(await runMatching(db)));
      console.log(JSON.stringify(await runNotifications(db)));
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
