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
  /** maxDetails を超えたため次回に回した詳細の件数 */
  deferred: number;
  /** 一覧が差分（期間で絞った検索）のため、掲載終了の判定に使えない */
  partialList?: boolean;
  /** 実際に行った一覧ページ・詳細ページの取得回数（従量課金サイトの利用量の記録用） */
  listRequests: number;
  detailRequests: number;
}

export interface CrawlOptions {
  /** 既知の listHash（sourceListingId → hash）。一致する物件は詳細取得を省略する */
  knownListHashes?: Map<string, string>;
  maxPages?: number;
  /**
   * 1回の巡回で取得する詳細ページの上限。初回は物件数が多いサイト（数百〜千件）があるため、
   * 上限を超えた分は次回以降に回す（未取得の物件は listHash が未登録なので次回また対象になる）。
   */
  maxDetails?: number;
  /** 取得回数をリアルタイムに書き込む（途中で例外になっても呼び出し側が利用量を記録できるように） */
  counters?: { list: number; detail: number };
  /** 1回の巡回で取得する一覧ページの上限（従量課金サイト用）。超えたら一覧の巡回を打ち切る */
  maxListRequests?: number;
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
  const {
    knownListHashes = new Map(),
    maxPages = 100,
    maxDetails = Number.POSITIVE_INFINITY,
    maxListRequests = Number.POSITIVE_INFINITY,
    onSnapshot,
  } = opts;
  const counters = opts.counters ?? { list: 0, detail: 0 };
  const listings: NormalizedListing[] = [];
  const errors: CrawlResult["errors"] = [];
  const seen = new Map<string, ListItem>();
  let listCompleted = true;
  let listRequests = 0;
  let countMismatch = false;

  if (adapter.login) await adapter.login(ctx);

  let detailCount = 0;
  let deferred = 0;
  const fetchDetails = async (items: Iterable<ListItem>) => {
    for (const item of items) {
      if (knownListHashes.get(item.sourceListingId) === item.listHash) continue;
      if (detailCount >= maxDetails) {
        deferred++;
        continue;
      }
      detailCount++;
      counters.detail++;
      // 取得を試みた時点で1件と数える（失敗しても相手側では表示・課金されている可能性がある）
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
  };

  for (const query of adapter.queries()) {
    let url: string | null = adapter.buildListUrl(query);
    let totalCount: number | null = null;
    let found = 0;
    for (let page = 0; url && page < maxPages; page++) {
      if (listRequests >= maxListRequests) break;
      listRequests++;
      counters.list++;
      const html = adapter.fetchList
        ? await adapter.fetchList(ctx, url)
        : (await ctx.get(url)).body;
      await onSnapshot?.("list", url, html);
      if (adapter.isLoggedOut?.(html, url)) throw new Error(`${adapter.meta.id}: セッション切れ`);
      const result = adapter.parseList(html, url);
      totalCount ??= result.totalCount;
      found += result.items.length;
      const pageItems: ListItem[] = [];
      for (const item of result.items) {
        if (seen.has(item.sourceListingId)) continue;
        seen.set(item.sourceListingId, item);
        pageItems.push(item);
      }
      // 詳細を「いま表示中の一覧ページ」からしか開けないサイト（レインズ）は、ページごとに詳細を取る
      if (adapter.meta.detailsAfterEachListPage) await fetchDetails(pageItems);
      url = result.nextPageUrl;
    }
    if (url) listCompleted = false; // maxPages / maxListRequests で打ち切った
    if (totalCount != null && totalCount !== found) countMismatch = true;
  }

  if (!adapter.meta.detailsAfterEachListPage) await fetchDetails(seen.values());

  return {
    listings,
    errors,
    listCompleted,
    seenIds: [...seen.keys()],
    listHashes: Object.fromEntries([...seen.values()].map((i) => [i.sourceListingId, i.listHash])),
    countMismatch,
    partialList: adapter.meta.incrementalList ?? false,
    deferred,
    listRequests,
    detailRequests: detailCount,
  };
}
