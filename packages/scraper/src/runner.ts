import { NormalizedListing } from "@devote/core";
import type { FetchContext, ListItem, SiteAdapter } from "./adapter.js";
import { describeBody, detectBlockPage } from "./block.js";

/** 詳細でブロック・チャレンジページがこの回数続いたら、その回の詳細取得を打ち切る */
const MAX_CONSECUTIVE_DETAIL_BLOCKS = 3;

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
  /**
   * 黙って0件にしないための警告（一覧0件のクエリ、ブロック・チャレンジページ、HTTPエラー等）。
   * crawl_runs.warnings とバッチのログに出す
   */
  warnings: string[];
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
  const warnings: string[] = [];
  const emptyQueries: string[] = [];

  if (adapter.login) await adapter.login(ctx);

  let detailCount = 0;
  let deferred = 0;
  let consecutiveBlocks = 0;
  let abortedReason: string | null = null;
  const fetchDetails = async (items: Iterable<ListItem>) => {
    for (const item of items) {
      if (knownListHashes.get(item.sourceListingId) === item.listHash) continue;
      if (detailCount >= maxDetails || abortedReason) {
        deferred++;
        continue;
      }
      detailCount++;
      counters.detail++;
      // 取得を試みた時点で1件と数える（失敗しても相手側では表示・課金されている可能性がある）
      let html: string | null = null;
      try {
        if (adapter.fetchDetail) {
          html = await adapter.fetchDetail(ctx, item);
        } else {
          const res = await ctx.get(item.detailUrl);
          html = res.body;
          const blocked = detectBlockPage(html, res.status);
          if (blocked)
            throw new Error(`ブロック・チャレンジの可能性（${blocked}）: ${describeBody(html)}`);
          if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${item.detailUrl}`);
        }
        await onSnapshot?.("detail", item.detailUrl, html);
        const raw = adapter.parseDetail(html, item.detailUrl);
        listings.push(NormalizedListing.parse(adapter.normalize(raw)));
        consecutiveBlocks = 0;
      } catch (e) {
        let message = e instanceof Error ? e.message : String(e);
        // fetchDetail を持つアダプターは HTTP エラーを例外にする（"HTTP 403: <url>"）
        const bodyBlock = html != null ? detectBlockPage(html) : null;
        if (bodyBlock && !message.includes("ブロック・チャレンジ")) {
          message = `ブロック・チャレンジの可能性（${bodyBlock}）: ${message}`;
        }
        if (
          message.includes("ブロック・チャレンジ") ||
          /\bHTTP (?:401|403|429|503)\b/.test(message)
        ) {
          consecutiveBlocks++;
          if (consecutiveBlocks >= MAX_CONSECUTIVE_DETAIL_BLOCKS) abortedReason = message;
        } else {
          consecutiveBlocks = 0;
        }
        errors.push({ item, error: message });
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
      let html: string;
      let status: number | undefined;
      if (adapter.fetchList) {
        html = await adapter.fetchList(ctx, url);
      } else {
        const res = await ctx.get(url);
        html = res.body;
        status = res.status;
      }
      await onSnapshot?.("list", url, html);
      if (adapter.isLoggedOut?.(html, url)) throw new Error(`${adapter.meta.id}: セッション切れ`);
      // ブロック・チャレンジページや HTTP エラーをパースすると「0件」になり、掲載終了の誤判定につながる。
      // このクエリの巡回を打ち切り、一覧は不完全として扱う
      const blocked = detectBlockPage(html, status);
      if (blocked || (status != null && status >= 400)) {
        warnings.push(
          `一覧がブロック・チャレンジ・エラーの可能性（${blocked ?? `HTTP ${status}`}）: ${url} ${describeBody(html)}`,
        );
        listCompleted = false;
        url = null;
        break;
      }
      const result = adapter.parseList(html, url);
      totalCount ??= result.totalCount;
      found += result.items.length;
      const pageItems = result.items.filter((i) => !seen.has(i.sourceListingId));
      for (const item of pageItems) seen.set(item.sourceListingId, item);
      // 詳細を「いま表示中の一覧ページ」からしか開けないサイト（レインズ）は、ページごとに詳細を取る
      if (adapter.meta.detailsAfterEachListPage) await fetchDetails(pageItems);
      url = result.nextPageUrl;
    }
    if (url) listCompleted = false; // maxPages / maxListRequests で打ち切った
    if (totalCount != null && totalCount !== found) countMismatch = true;
    if (found === 0) emptyQueries.push(query.key);
  }
  if (emptyQueries.length > 0) {
    warnings.push(`一覧が0件のクエリ: ${emptyQueries.join(", ")}`);
  }
  if (seen.size === 0) {
    warnings.push("一覧が全体で0件（ブロック・構造変化・検索条件の誤りの可能性）");
  }

  if (!adapter.meta.detailsAfterEachListPage) await fetchDetails(seen.values());
  if (abortedReason) {
    warnings.push(
      `詳細でブロック・チャレンジが${MAX_CONSECUTIVE_DETAIL_BLOCKS}回続いたため打ち切り: ${abortedReason}`,
    );
  }

  return {
    listings,
    errors,
    listCompleted,
    seenIds: [...seen.keys()],
    listHashes: Object.fromEntries([...seen.values()].map((i) => [i.sourceListingId, i.listHash])),
    countMismatch,
    deferred,
    listRequests,
    detailRequests: detailCount,
    partialList: adapter.meta.incrementalList ?? false,
    warnings,
  };
}
