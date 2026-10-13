import { NormalizedListing } from "@devote/core";
import type { FetchContext, ListItem, SiteAdapter } from "./adapter.js";

export interface CrawlResult {
  listings: NormalizedListing[];
  /** 一覧で見えたが詳細取得・パースに失敗したもの */
  errors: { item: ListItem; error: string }[];
  /** 一覧を最後のページまで正常に巡回できたか（掲載終了判定はこれが true のときだけ行う） */
  listCompleted: boolean;
  seenIds: string[];
  /** 一覧で見えた物件の listHash（sourceListingId → hash） */
  listHashes: Record<string, string>;
  /** 一覧の表示総件数と実際に拾えた件数のずれ（構造変化の兆候） */
  countMismatch: boolean;
}

export interface CrawlOptions {
  /** 既知の listHash（sourceListingId → hash）。一致する物件は詳細取得を省略する */
  knownListHashes?: Map<string, string>;
  maxPages?: number;
  /** 取得した生HTMLの保存フック（raw_snapshots） */
  onSnapshot?: (kind: "list" | "detail", url: string, body: string) => Promise<void> | void;
}

/**
 * 1ソースを巡回する: 一覧（全ページ）→ 詳細 → 正規化。
 * DBへの保存・差分検知・名寄せは呼び出し側（パイプライン）の責務。
 */
export async function crawlSource(
  adapter: SiteAdapter,
  ctx: FetchContext,
  opts: CrawlOptions = {},
): Promise<CrawlResult> {
  const { knownListHashes = new Map(), maxPages = 100, onSnapshot } = opts;
  const listings: NormalizedListing[] = [];
  const errors: CrawlResult["errors"] = [];
  const seen = new Map<string, ListItem>();
  let listCompleted = true;
  let countMismatch = false;

  if (adapter.login) await adapter.login(ctx);

  for (const query of adapter.queries()) {
    let url: string | null = adapter.buildListUrl(query);
    let totalCount: number | null = null;
    let found = 0;
    for (let page = 0; url && page < maxPages; page++) {
      const html = adapter.fetchList
        ? await adapter.fetchList(ctx, url)
        : (await ctx.get(url)).body;
      await onSnapshot?.("list", url, html);
      if (adapter.isLoggedOut?.(html, url)) throw new Error(`${adapter.meta.id}: セッション切れ`);
      const result = adapter.parseList(html, url);
      totalCount ??= result.totalCount;
      found += result.items.length;
      for (const item of result.items) seen.set(item.sourceListingId, item);
      url = result.nextPageUrl;
    }
    if (url) listCompleted = false; // maxPages で打ち切った
    if (totalCount != null && totalCount !== found) countMismatch = true;
  }

  for (const item of seen.values()) {
    if (knownListHashes.get(item.sourceListingId) === item.listHash) continue;
    try {
      const html = adapter.fetchDetail
        ? await adapter.fetchDetail(ctx, item)
        : (await ctx.get(item.detailUrl)).body;
      await onSnapshot?.("detail", item.detailUrl, html);
      const raw = adapter.parseDetail(html, item.detailUrl);
      listings.push(NormalizedListing.parse(adapter.normalize(raw)));
    } catch (e) {
      errors.push({ item, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    listings,
    errors,
    listCompleted,
    seenIds: [...seen.keys()],
    listHashes: Object.fromEntries([...seen.values()].map((i) => [i.sourceListingId, i.listHash])),
    countMismatch,
  };
}
