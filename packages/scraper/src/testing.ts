import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FetchContext } from "./adapter.js";

/** URL → フィクスチャファイル名 の対応表から、オフラインの FetchContext を作る（テスト・デモ用） */
export function fixtureFetcher(dir: string, routes: Record<string, string>): FetchContext {
  return {
    async get(url) {
      const file = routes[url];
      if (!file) return { status: 404, body: "", url };
      return { status: 200, body: readFileSync(join(dir, file), "utf8"), url };
    },
  };
}
