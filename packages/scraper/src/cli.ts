/**
 * 使い方:
 *   pnpm scrape <adapterId>            実サイトを巡回して結果をJSONで出力
 *   pnpm scrape sample-realtor --fixtures   フィクスチャでオフライン実行（デモ）
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpFetcher } from "./fetcher.js";
import { adapters } from "./registry.js";
import { crawlSource } from "./runner.js";
import { fixtureFetcher } from "./testing.js";

const [id, ...flags] = process.argv.slice(2);
const adapter = id ? adapters[id] : undefined;
if (!adapter) {
  console.error(`usage: pnpm scrape <${Object.keys(adapters).join("|")}> [--fixtures]`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const ctx = flags.includes("--fixtures")
  ? fixtureFetcher(join(here, "adapters", id as string, "__fixtures__"), {
      "https://sample-realtor.example/rent/list?area=meguro": "list-1.html",
      "https://sample-realtor.example/rent/list?area=meguro&page=2": "list-2.html",
      "https://sample-realtor.example/rent/R-10001": "detail-R-10001.html",
      "https://sample-realtor.example/rent/R-10002": "detail-R-10002.html",
      "https://sample-realtor.example/rent/R-10003": "detail-R-10003.html",
    })
  : createHttpFetcher(adapter.meta);

const result = await crawlSource(adapter, ctx);
console.log(JSON.stringify(result, null, 2));
