import type { NormalizedListingInput } from "@devote/core";

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
  schedule: { listCron: string; detailRevisitHours: number };
  /** パーサ改修ごとに上げる。raw_snapshots.parser_version と比較して再パースする */
  parserVersion: string;
}

/** 一覧のエントリポイント（エリア×種別など） */
export interface SearchQuery {
  key: string;
  params: Record<string, string | number>;
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
  queries(): SearchQuery[];
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
