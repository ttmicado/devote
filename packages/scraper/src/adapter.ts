import type { CrawlScope, NormalizedListingInput } from "@devote/core";

/**
 * サイトごとのアダプター（プラグイン）。
 *
 * 原則:
 * - parseList / parseDetail / normalize は I/O を持たない純関数にする。
 *   → フィクスチャHTMLでテストでき、保存済みスナップショットから再パースできる。
 * - 取得（fetch）は共通の Fetcher が担う。SPA で内部 JSON API を叩く・ログインが必要など
 *   特殊な場合だけ fetchList / fetchDetail / login を実装する。
 * - 生HTMLの保存・差分検知・名寄せはパイプライン側の責務。アダプターは関知しない。
 */
export type FetchMode = "http" | "browser";

export interface SourceMeta {
  /** 一意なID。listings.source に入る 例: "reins", "atbb", "sample-realtor" */
  id: string;
  displayName: string;
  kind: "b2b" | "portal" | "realtor_own" | "other"; // 業者間サイト / ポータル / 自社サイト
  fetchMode: { list: FetchMode; detail: FetchMode };
  requiresLogin: boolean;
  /** 1リクエストあたりの最小間隔(ms)と同時実行数。会員サイトは同時実行1固定 */
  rateLimit: { minIntervalMs: number; maxConcurrency: number };
  /** 一覧巡回の cron（JST）と詳細の再確認間隔 */
  schedule: {
    listCron: string;
    detailRevisitHours: number;
    /** 前回の巡回からこの分数が経つまでは巡回しない（定期実行は30分ごとに全ソースを起動する） */
    minRunIntervalMinutes?: number;
    /** 巡回してよい時間帯（JST、[開始時, 終了時)）。例: レインズは [7, 23] */
    activeHoursJst?: [number, number];
  };
  /**
   * 月間の利用上限（従量課金・無料枠のあるサイト用）。
   * list = 検索（一覧ページの表示1回で1件）、detail = 物件詳細の表示1回で1件。
   * 上限は月末まで日割りで配分し、月の前半に使い切らないようにする。
   */
  monthlyQuota?: { list?: number; detail?: number };
  /**
   * 一覧が差分（登録・変更日で絞った検索）で、全件ではない。
   * true なら一覧に出なかった掲載を掲載終了とみなさない（レインズ）
   */
  incrementalList?: boolean;
  /**
   * 詳細は「いま表示中の一覧ページ」からしか開けない（レインズ）。
   * true なら一覧の1ページごとに、そのページの詳細を続けて取得してから次のページへ進む
   */
  detailsAfterEachListPage?: boolean;
  /**
   * 検索範囲をユーザーの希望条件（QueryContext.scopes）から作る（会員サイト）。
   * true のソースは、希望条件を持つユーザーがいなければ巡回しない
   */
  scopedByConditions?: boolean;
  /**
   * 一覧のページ送りは利用量（monthlyQuota.list）に数えない。検索1回 = 1件。
   * レインズは Myレインズの利用実績で、ページ送りが「物件検索」に数えられないことを確認（2026-10-15）
   */
  pageTurnsAreFree?: boolean;
  /** パーサ改修ごとに上げる。raw_snapshots.parser_version と比較して再パースする */
  parserVersion: string;
}

/** 一覧のエントリポイント（エリア×種別など） */
export interface SearchQuery {
  key: string;
  params: Record<string, string | number>;
}

/** queries() に渡す実行時の情報 */
export interface QueryContext {
  /** 有効な希望条件から作った検索範囲（crawlScopes）。scopedByConditions のソースだけが使う */
  scopes?: CrawlScope[];
}

export interface ListItem {
  sourceListingId: string;
  detailUrl: string;
  /** 一覧で取れる主要値のハッシュ。変化がなければ詳細取得を省略できる */
  listHash: string;
  price?: number;
}

export interface ListPageResult {
  items: ListItem[];
  nextPageUrl: string | null;
  /** サイトが表示する総件数（構造変化の検知に使う） */
  totalCount: number | null;
  /**
   * この一覧が期間などで絞った差分か（true）、条件に合う全件か（false）。
   * 未指定なら meta.incrementalList に従う。全件の検索だけなら掲載終了を判定できる
   */
  partial?: boolean;
}

/** 詳細ページから抜き出した表記どおりの生テキスト（「賃料」「専有面積」…） */
export interface RawDetail {
  sourceListingId: string;
  url: string;
  fields: Record<string, string>;
  imageUrls: string[];
}

export interface FetchContext {
  get(url: string): Promise<{ status: number; body: string; url: string }>;
  /** browser モード時のみ */
  page?: import("playwright").Page;
}

export interface SiteAdapter {
  meta: SourceMeta;
  queries(ctx?: QueryContext): SearchQuery[];
  buildListUrl(q: SearchQuery): string;
  parseList(html: string, url: string): ListPageResult;
  parseDetail(html: string, url: string): RawDetail;
  normalize(raw: RawDetail): NormalizedListingInput;

  /** ログインが必要なサイトのみ */
  login?(ctx: FetchContext): Promise<void>;
  isLoggedOut?(html: string, url: string): boolean;
  /** デフォルトの取得方法を上書きしたい場合のみ（SPA の内部APIなど） */
  fetchList?(ctx: FetchContext, url: string): Promise<string>;
  fetchDetail?(ctx: FetchContext, item: ListItem): Promise<string>;
}

export const defineAdapter = (a: SiteAdapter): SiteAdapter => a;
