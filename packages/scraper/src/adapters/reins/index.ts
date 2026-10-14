import { createHash } from "node:crypto";
import {
  type DealType,
  directionFeatures,
  extractFeatures,
  type NormalizedListingInput,
  parseAreaSqm,
  parseBuiltYearMonth,
  parseFloor,
  parseLayout,
  parseMonthsOrYen,
  parseStationAccess,
  parseYen,
  type StationAccess,
  splitAddress,
  TARGET_AREAS,
  type TransactionMode,
} from "@devote/core";
import * as cheerio from "cheerio";
import type { Page, Response } from "playwright";
import {
  defineAdapter,
  type FetchContext,
  type ListItem,
  type SearchQuery,
} from "../../adapter.js";

/**
 * レインズ（REINS IP型 / 4機構共通システム, https://system.reins.jp/）アダプター。
 *
 * 2026-10-14 にログイン後の実画面で確認済み（docs/member-sites.md §0）。
 * 流れ: メインメニュー → 賃貸/売買 物件検索 → 条件（種別・所在地・登録/変更年月日=当日 等）→ 件数事前確認（無課金）
 *   → 0件なら終わり／あれば【検索】→ 一覧（API の JSON、1ページ50件）→ 行の【詳細】→ 戻る。
 *
 * 分かっていること（2026-10-13 時点）:
 * - ログイン画面は Nuxt(Vue) の SPA。ユーザID（12桁）・パスワード（最大12桁）・
 *   「所属機構の規程及びガイドラインを遵守します」チェック（必須。未チェックだとボタンが disabled）
 * - 認証は POST main/api/login → localStorage に mainRefreshToken 等を保存するトークン方式
 *   （storageState には localStorage も含まれるのでセッション保存で引き継げる見込み）
 * - HTML に reCAPTCHA Enterprise の sitekey があるが、ログイン画面では現状読み込まれていない
 * - UA に "HeadlessChrome" を含むと 503 が返る → applyBrowserProfile() で通常の Chrome UA に差し替える
 * - 提供時間 7:00〜23:00（12/28〜1/3 休止）。時間外はスケジュールしないこと
 * - 検索は「物件種別１」＋「所在地/沿線」のいずれかが必須。結果は最大500件。
 *   公開マニュアル（近畿）では「検索結果が表示された時点で課金」「件数事前確認は無課金」とある。
 *   ミカド社の確認では、月間の検索・図面・物件詳細検索がそれぞれ 6,000 件を超えると課金
 *   → meta.monthlyQuota で上限管理（図面の一括取得を実装するときは kind "drawing" で記録すること）
 * - 画像は物件詳細でのみ閲覧可（公式に「保存できません」と注意書き）。図面は一覧で最大20件を
 *   1つのPDFにまとめて「図面一括取得」できる
 */
export const VERIFIED = true;

export const SOURCE_ID = "reins";
export const BASE_URL = "https://system.reins.jp";
export const LOGIN_URL = `${BASE_URL}/login/main/KG/GKG001200`;
/** HeadlessChrome の UA だと 503 になるため、通常の Chrome の UA を名乗る */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** explore.ts から各画面のキャプチャを差し込むためのフック（本番では未設定） */
export const hooks: {
  onStep?: (step: string) => Promise<void>;
  /** true なら件数事前確認（無課金）で止め、【検索】（課金対象）は押さない。explore.ts --precheck-only 用 */
  precheckOnly?: boolean;
  onBack?: (activePage: string, expected: number) => Promise<void>;
  onDetail?: (id: string, html: string, url: string, popup: boolean, from: string) => Promise<void>;
  /** 事前確認の件数がこれを超えたら【検索】しない（explore.ts の安全弁） */
  maxSearchCount?: number;
} = {};
const step = async (name: string) => {
  await hooks.onStep?.(name).catch(() => undefined);
};

/** ログイン直後の画面（メインメニュー）の URL。ログイン時に記録する */
let mainMenuUrl: string | null = null;
/** いま画面に出ている検索結果の検索キー（ページ送りの判定用） */
let currentSearchKey: string | null = null;
/** 直近の一覧 API の JSON */
let lastListJson: string | null = null;
/** 直近の一覧の物件番号（表示順） */
let lastListIds: string[] = [];
/** 直近の件数事前確認の結果（explore.ts のログ用） */
export let lastPrecheckCount: number | null = null;

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function credentials(): { userId: string; password: string } {
  const userId = process.env.REINS_USER_ID;
  const password = process.env.REINS_PASSWORD;
  if (!userId || !password) {
    throw new Error(
      "reins: 環境変数 REINS_USER_ID / REINS_PASSWORD が未設定です。.env に設定してください（コミットしない）",
    );
  }
  return { userId, password };
}

function requirePage(ctx: FetchContext): Page {
  if (!ctx.page) throw new Error("reins: browser モードの FetchContext（ctx.page）が必要です");
  return ctx.page;
}

const profiled = new WeakSet<object>();
/** UA を通常の Chrome に差し替える（createBrowserFetchContext が UA 指定に未対応のため） */
export async function applyBrowserProfile(page: Page): Promise<void> {
  const context = page.context();
  if (profiled.has(context)) return;
  profiled.add(context);
  await context.setExtraHTTPHeaders({ "User-Agent": BROWSER_UA });
  await context.addInitScript((ua: string) => {
    Object.defineProperty(navigator, "userAgent", { get: () => ua });
  }, BROWSER_UA);
}

// ---------------------------------------------------------------------------
// 検索クエリ（擬似URL）
// ---------------------------------------------------------------------------

/** レインズの物件種別１（検索対象）。選択肢の表記は 2026-10-14 確認 */
const PROPERTY_KIND: Record<DealType, string> = {
  rent: "賃貸マンション",
  sale: "売マンション",
};

/**
 * 登録年月日・変更年月日で絞る期間（画面のラジオボタンの表記）。all は指定なし（全期間）。
 * 当日・前日は画面の選択肢そのまま（前日は「前日以降」の意味と思われる: 前日=538件 ≒ 3日以内の約半分）
 */
export const PERIOD_LABEL = {
  today: "当日",
  yesterday: "前日",
  "3d": "３日以内",
  "1w": "１週間以内",
  "1m": "１ヶ月以内",
  all: null,
} as const;
export type ReinsPeriod = keyof typeof PERIOD_LABEL;
const isPeriod = (v: unknown): v is ReinsPeriod =>
  typeof v === "string" && Object.hasOwn(PERIOD_LABEL, v);
/**
 * 既定の期間。実測（2026-10-14 港区・賃貸マンション）で 3日以内=1,050件・前日=538件・当日(8:40)=151件。
 * 3日以内でも上限500件を超えるため、日中は「当日」、朝（9時前）の初回だけ「前日」にして夜間の更新を拾う
 * （前日は500件を超えうるが、並び順が最新順なので切れるのは前日の朝の分＝前日の巡回で取得済み）
 */
export const defaultPeriod = (now = new Date()): ReinsPeriod => {
  const v = process.env.REINS_SEARCH_PERIOD;
  if (isPeriod(v)) return v;
  const hourJst = (now.getUTCHours() + 9) % 24;
  return hourJst < 9 ? "yesterday" : "today";
};

export interface ReinsSearch {
  deal: DealType;
  prefecture: string;
  city: string;
  town: string | null;
  period: ReinsPeriod;
  page: number;
}

export function buildSearchUrl(
  s: Omit<ReinsSearch, "page" | "period"> & { page?: number; period?: ReinsPeriod },
): string {
  const p = new URLSearchParams({ deal: s.deal, pref: s.prefecture, city: s.city });
  if (s.town) p.set("town", s.town);
  if (s.period && s.period !== "all") p.set("period", s.period);
  if (s.page && s.page > 1) p.set("page", String(s.page));
  return `reins://search?${p.toString()}`;
}

export function parseSearchUrl(url: string): ReinsSearch {
  const u = new URL(url);
  if (u.protocol !== "reins:") throw new Error(`reins: 検索の擬似URLではない: ${url}`);
  const deal = u.searchParams.get("deal");
  const city = u.searchParams.get("city");
  if ((deal !== "rent" && deal !== "sale") || !city)
    throw new Error(`reins: 不正な検索URL: ${url}`);
  return {
    deal,
    prefecture: u.searchParams.get("pref") ?? "東京都",
    city,
    town: u.searchParams.get("town"),
    period: isPeriod(u.searchParams.get("period"))
      ? (u.searchParams.get("period") as ReinsPeriod)
      : "all",
    page: Number(u.searchParams.get("page") ?? "1"),
  };
}

const searchKey = (s: ReinsSearch) =>
  `${s.deal}|${s.prefecture}|${s.city}|${s.town ?? ""}|${s.period}`;

export function detailUrlOf(id: string, deal: DealType): string {
  return `reins://detail?${new URLSearchParams({ id, deal }).toString()}`;
}

// ---------------------------------------------------------------------------
// 画面操作（Playwright）
// ---------------------------------------------------------------------------

/** ラベル（.p-label など）の直後にある入力要素 */
const afterLabel = (page: Page, label: RegExp, tag: "input" | "select") =>
  page
    .locator(".p-label, label, th, span", { hasText: label })
    .first()
    .locator(`xpath=following::${tag}[1]`);

async function waitSettled(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

async function throwIfChallenge(page: Page) {
  // reCAPTCHA の画像チャレンジ（bframe）が出たら自動突破せず止める（2026-10-14 時点では出ない）
  const challenge = page.locator('iframe[src*="recaptcha"][src*="bframe"]');
  if ((await challenge.count()) > 0 && (await challenge.first().isVisible())) {
    throw new Error(
      "reins: reCAPTCHA のチャレンジが表示されました。自動では突破しません（人が対応）",
    );
  }
}

async function openMainMenu(page: Page) {
  if (mainMenuUrl && page.url() !== mainMenuUrl) {
    await page.goto(mainMenuUrl, { waitUntil: "domcontentloaded" });
    await waitSettled(page);
  }
}

/** 「その他検索項目」の 登録年月日 / 変更年月日 のラジオボタンを選ぶ（.p-label の親 .col の中にある） */
async function choosePeriod(page: Page, label: "登録年月日" | "変更年月日", option: string) {
  await page
    .locator(".p-label-title", { hasText: new RegExp(`^\\s*${label}\\s*$`) })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'col')][1]")
    .locator("label", { hasText: option })
    .first()
    .click();
}

/** 件数事前確認が 0件で【検索】しなかったことを表す一覧の本文（parseList が 0件として扱う） */
export const EMPTY_LIST_MARKER = "<!-- reins:precheck-empty -->";

/** 検索条件を入れて件数事前確認 → 一覧。0件なら一覧を開かない */
async function runSearch(page: Page, s: ReinsSearch): Promise<{ count: number }> {
  await openMainMenu(page);
  // メインメニューの【賃貸 物件検索】/【売買 物件検索】（ボタン）
  const entry = s.deal === "rent" ? /賃貸\s*物件検索/ : /売買\s*物件検索/;
  await page
    .getByRole("link", { name: entry })
    .or(page.getByRole("button", { name: entry }))
    .first()
    .click();
  await waitSettled(page);
  await step("search-form");

  // 物件種別１（必須。select）
  await afterLabel(page, /物件種別\s*[1１]/, "select").selectOption({
    label: PROPERTY_KIND[s.deal],
  });
  // 所在地は「入力ガイド」を使わず直接入力できる（都道府県名・所在地名１は完全一致、所在地名２は前方一致）
  await afterLabel(page, /都道府県名/, "input").fill(s.prefecture);
  await afterLabel(page, /所在地名\s*[1１]/, "input").fill(s.city);
  if (s.town) {
    // 所在地名２は「〇丁目」を消すと町名全域になる（マニュアル P29）
    await afterLabel(page, /所在地名\s*[2２]/, "input").fill(s.town);
  }
  // 差分巡回: 「その他検索項目(在庫のみ)」の登録年月日・変更年月日（いずれかに一致＝OR）で期間を絞る。
  //   港区の賃貸マンションは全期間だと 3,112件（2026-10-14）で上限500件を超えるため、期間指定は必須
  const period = PERIOD_LABEL[s.period];
  if (period) {
    await choosePeriod(page, "登録年月日", period);
    await choosePeriod(page, "変更年月日", period);
  }
  await step("search-filled");

  // 件数事前確認（無課金）。件数は API（getBkknDataCount）の JSON から読む
  const [countRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/getBkknDataCount"), { timeout: 30_000 }),
    page
      .getByRole("button", { name: /件数事前確認/ })
      .first()
      .click(),
  ]);
  const count = Number(((await countRes.json()) as { count?: number }).count ?? Number.NaN);
  const dialog = page.getByRole("dialog");
  await dialog
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => undefined);
  await step("search-precheck");
  lastPrecheckCount = Number.isFinite(count) ? count : null;
  const cancel = async () => {
    await dialog
      .getByRole("button", { name: /キャンセル|閉じる|OK/ })
      .first()
      .click({ timeout: 3_000 })
      .catch(() => page.keyboard.press("Escape"));
  };
  if (!Number.isFinite(count)) {
    await cancel();
    throw new Error(`reins: 件数事前確認の結果が読めない: ${searchKey(s)}`);
  }
  if (count === 0) {
    // 0件なら【検索】しない（一覧表示＝課金を避ける）
    await cancel();
    currentSearchKey = null;
    return { count };
  }
  if (count > 500) {
    console.warn(
      `reins: ${searchKey(s)} のヒットが ${count} 件で上限500件を超えています（期間を短くする）`,
    );
  }
  if (hooks.precheckOnly || (hooks.maxSearchCount != null && count > hooks.maxSearchCount)) {
    await cancel();
    currentSearchKey = null;
    if (hooks.precheckOnly) return { count };
    throw new Error(
      `reins: ${searchKey(s)} は ${count} 件で上限 ${hooks.maxSearchCount} 件を超えるため検索しない`,
    );
  }

  // 事前確認のダイアログの【検索】で一覧へ（ダイアログが出ていなければ画面下の【検索】）
  //   一覧は API（.../getInitDataFromKnskJyukn）の JSON に最大500件がまとめて入っている（画面は50件ずつ表示）
  const listRes = page.waitForResponse(isListResponse, { timeout: 60_000 });
  const dialogSearch = dialog.getByRole("button", { name: /^\s*検索\s*$/ });
  if ((await dialogSearch.count()) > 0 && (await dialogSearch.first().isVisible())) {
    await dialogSearch.first().click();
  } else {
    await page
      .getByRole("button", { name: /^\s*検索\s*$/ })
      .first()
      .click();
  }
  const res = await listRes;
  if (!res.ok()) throw new Error(`reins: 一覧の取得に失敗: HTTP ${res.status()}`);
  await setListJson(await res.text(), s);
  shownPage = 1;
  await waitRows(page);
  await throwIfChallenge(page);
  currentSearchKey = searchKey(s);
  await step("list");
  return { count };
}

/** 一覧の1ページの件数と、検索で表示できる上限 */
const PAGE_SIZE = 50;
const MAX_RESULTS = 500;
/** 一覧の表示中のページ（1始まり） */
let shownPage = 1;

const isListResponse = (r: Response) =>
  /\/api\/BK\/GBK002\d00\//.test(r.url()) && r.request().method() === "POST";

/** 一覧の n ページ目を表示し、そのページの JSON を lastListJson に入れる（b-pagination のボタン "Go to page n"） */
async function showResultPage(page: Page, s: ReinsSearch) {
  const n = s.page;
  const res = page.waitForResponse(isListResponse, { timeout: 60_000 });
  await page.locator(`button[aria-label="Go to page ${n}"]`).first().click();
  const r = await res;
  if (!r.ok()) throw new Error(`reins: 一覧 ${n} ページ目の取得に失敗: HTTP ${r.status()}`);
  await setListJson(await r.text(), s);
  await waitRows(page);
  shownPage = n;
  await step(`list-page-${n}`);
}

/** 一覧の行（.p-table-body-row）は API の応答より少し遅れて描画される */
async function waitRows(page: Page) {
  await page
    .locator(".p-table-body-row")
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await waitSettled(page);
}

async function setListJson(json: string, s: ReinsSearch) {
  lastListJson = json;
  lastListIds = parseListJson(json, buildSearchUrl(s)).items.map((i) => i.sourceListingId);
}

// ---------------------------------------------------------------------------
// パーサ（純関数）
// ---------------------------------------------------------------------------

/** ログイン画面・ログアウト後の画面か */
export function isLoginPage(html: string, url: string): boolean {
  if (/\/(login|logout)\/main\//.test(url)) return true;
  const $ = cheerio.load(html);
  const hasPassword = $('input[type="password"]').length > 0;
  const text = squash($("body").text());
  return hasPassword && text.includes("所属機構の規程及びガイドラインを遵守します");
}

/**
 * 詳細画面の「項目名 → 値」を集める。
 * 構造（2026-10-14 実物）: `.col > .p-label > .p-label-title`（項目名）と、同じ `.col` 内の残り（値）。
 * 値が空の項目も並ぶので、項目名と値は必ず同じ `.col` の中で対応づける。
 * 同じ項目名が繰り返される（沿線名・駅名は3組）場合は2つ目以降に番号を付ける（沿線名2, 沿線名3）。
 * 表示幅で出し分ける重複要素（.d-sm-none）は除く。
 */
export function extractLabelValues(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  $("script, style, .d-sm-none").remove();
  $("br").replaceWith("\n");
  const fields: Record<string, string> = {};
  const seen = new Map<string, number>();
  $(".p-label-title").each((_, el) => {
    const label = squash($(el).text()).replace(/[:：]$/, "");
    if (!label) return;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    const col = $(el).closest(".p-label").parent().clone();
    col.find(".p-label").remove();
    const value = col
      .text()
      .normalize("NFKC")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    const key = n === 1 ? label : `${label}${n}`;
    if (value && !(key in fields)) fields[key] = value;
  });
  return fields;
}

const pick = (f: Record<string, string>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = f[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
};

const BUKKEN_NO = /(?<!\d)(\d{12})(?!\d)/; // 新システムの物件番号は12桁

/**
 * 一覧の API（1ページ目 .../getInitDataFromKnskJyukn、2ページ目以降 .../getBkknListData）の JSON をパースする。
 * 件数事前確認が0件で検索しなかった場合は EMPTY_LIST_MARKER。
 */
export function parseListJson(body: string, url: string) {
  const s = parseSearchUrl(url);
  if (body.trim() === EMPTY_LIST_MARKER) return { items: [], nextPageUrl: null, totalCount: 0 };
  if (!body.trimStart().startsWith("{")) {
    throw new Error(`reins: 一覧が JSON ではない（構造が想定と違う）: ${url}`);
  }
  type Part = { knskResultList?: Record<string, unknown>[]; knskResultListKnsu?: number };
  const d = JSON.parse(body) as Part & {
    bkknKnskListResultData1?: Part;
    bkknKnskListResultData2?: Part;
  };
  // 1ページ目（.../getInitDataFromKnskJyukn）は物件種別ごとに bkknKnskListResultData1/2 の中、
  // 2ページ目以降（.../getBkknListData）は直下に knskResultList / knskResultListKnsu がある。
  // knskResultListKnsu は検索結果の総件数（画面に出せるのは500件まで）、knskResultList は表示中の1ページ分（50件）
  const parts: (Part | undefined)[] = [d.bkknKnskListResultData1, d.bkknKnskListResultData2, d];
  const rows = parts.flatMap((p) => p?.knskResultList ?? []);
  const total = parts.reduce((sum, p) => sum + (p?.knskResultListKnsu ?? 0), 0);
  const reachable = Math.min(total, MAX_RESULTS);
  return {
    items: rows.map((r) => ({
      sourceListingId: String(r.bkknBngu),
      detailUrl: detailUrlOf(String(r.bkknBngu), s.deal),
      listHash: sha1(JSON.stringify(r)),
      price: typeof r.kkkuCnryu === "number" ? r.kkkuCnryu : undefined,
    })),
    nextPageUrl: s.page * PAGE_SIZE < reachable ? buildSearchUrl({ ...s, page: s.page + 1 }) : null,
    totalCount: reachable,
  };
}

const TRANSACTION_MODES: [RegExp, TransactionMode][] = [
  [/専属専任|専任/, "exclusive_agency"],
  [/一般/, "general_agency"],
  [/代理/, "agent"],
  [/貸主|売主/, "owner"],
  [/媒介|仲介/, "brokerage"],
];

const STRUCTURES: [RegExp, string][] = [
  [/鉄骨鉄筋|SRC/i, "SRC"],
  [/鉄筋コンクリート|RC/i, "RC"],
  [/軽量鉄骨/, "LGS"],
  [/鉄骨|^S造?$/, "S"],
  [/木造/, "W"],
];

/** "令和 8年10月14日" / "2026年10月14日" → ISO（JST の 0時） */
export function parseJpDate(v: string | undefined): string | null {
  const t = v?.normalize("NFKC").replace(/\s+/g, "");
  if (!t) return null;
  const era = t.match(/^(令和|平成)(\d{1,2}|元)年(\d{1,2})月(\d{1,2})日/);
  const western = t.match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  const ymd = era
    ? [(era[1] === "令和" ? 2018 : 1988) + (era[2] === "元" ? 1 : Number(era[2])), era[3], era[4]]
    : western
      ? [Number(western[1]), western[2], western[3]]
      : null;
  if (!ymd) return null;
  const [y, m, d] = ymd;
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+09:00`,
  ).toISOString();
}

/** 沿線名/駅名/駅より徒歩 の組（2組目以降は 沿線名2 …）を「線「駅」駅 徒歩N分」にして parseStationAccess に渡す */
function stationsOf(f: Record<string, string>): StationAccess[] {
  const out: StationAccess[] = [];
  for (const suffix of ["", "2", "3"]) {
    const line = f[`沿線名${suffix}`];
    const station = f[`駅名${suffix}`];
    if (!station) continue;
    const walkMin = f[`駅より徒歩${suffix}`]?.match(/(\d+)\s*分/)?.[1];
    const s = parseStationAccess(
      `${line ?? ""}「${station.replace(/駅$/, "")}」駅${walkMin ? ` 徒歩${walkMin}分` : ""}`,
    );
    if (s && !out.some((o) => o.station === s.station && o.line === s.line)) out.push(s);
  }
  return out;
}

/** 「なし」は 0円、「-」・空は不明 */
const yenOrNone = (v: string | undefined): number | null =>
  v == null ? null : /^なし$/.test(v.trim()) ? 0 : parseYen(v);
const monthsOrNone = (v: string | undefined, rent: number): number | null =>
  v == null ? null : /^なし$/.test(v.trim()) ? 0 : parseMonthsOrYen(v, rent);

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "レインズ（REINS IP型）",
    kind: "b2b",
    fetchMode: { list: "browser", detail: "browser" },
    requiresLogin: true,
    // 課金・負荷の両面から控えめに。会員サイトは同時実行1固定
    rateLimit: { minIntervalMs: 5000, maxConcurrency: 1 },
    // 提供時間 7:00〜23:00。2時間ごと（1回 = 12検索＋ページ送り）
    schedule: {
      listCron: "15 7-22/2 * * *",
      detailRevisitHours: 72,
      minRunIntervalMinutes: 120,
      activeHoursJst: [7, 23],
    },
    // 月間の検索・物件詳細・図面はそれぞれ 6,000 件まで無料・超過分は1件3円（ミカド社確認、2026-10）。
    // 無料枠は会員（会社）単位で、人の利用と共有。Myレインズの利用実績（2026-10 は13日間で物件検索 376件・
    // 物件詳細 263件）から人の分を月 1,500件程度と見て、巡回の既定は 4,500件。日割りで配分する
    // （REINS_MONTHLY_*_LIMIT で変更可）
    monthlyQuota: {
      list: Number(process.env.REINS_MONTHLY_SEARCH_LIMIT || 4500),
      detail: Number(process.env.REINS_MONTHLY_DETAIL_LIMIT || 4500),
    },
    // 期間（当日/前日）で絞った差分検索なので、一覧に出ないことを掲載終了とみなさない
    incrementalList: true,
    // 詳細は表示中の検索結果の一覧（ページ）からしか開けない
    detailsAfterEachListPage: true,
    parserVersion: "1",
  },

  queries(): SearchQuery[] {
    const deals: DealType[] = ["rent", "sale"];
    return deals.flatMap((deal) =>
      TARGET_AREAS.flatMap((a) =>
        (a.towns ?? [null]).map((town) => ({
          key: `${deal}-${a.city}${town ?? ""}`,
          params: {
            deal,
            prefecture: a.prefecture,
            city: a.city,
            period: defaultPeriod(),
            ...(town ? { town } : {}),
          },
        })),
      ),
    );
  },

  buildListUrl: (q) =>
    buildSearchUrl({
      deal: q.params.deal === "sale" ? "sale" : "rent",
      prefecture: String(q.params.prefecture ?? "東京都"),
      city: String(q.params.city),
      town: q.params.town ? String(q.params.town) : null,
      period: isPeriod(q.params.period) ? q.params.period : "all",
    }),

  async login(ctx) {
    const { userId, password } = credentials();
    const page = requirePage(ctx);
    await applyBrowserProfile(page);
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitSettled(page);
    if (!isLoginPage(await page.content(), page.url())) {
      // 保存済みセッション（localStorage のトークン）でメニューに入れた
      mainMenuUrl = page.url();
      return;
    }
    await step("login-page"); // 入力前に撮る（スクショにIDを残さない）
    await afterLabel(page, /ユーザID/, "input").fill(userId);
    await page.locator('input[type="password"]').first().fill(password);
    // カスタムチェックボックスは label をクリックしないと切り替わらない。
    // 画面の再描画で状態が戻ることがある（2026-10-14 に未チェックのまま送信して 401 になった）ので、
    // チェック済みを確認してから送信する。未チェックのまま送るとログイン失敗が1回数えられる
    const agree = page
      .locator(".custom-checkbox", { hasText: "所属機構の規程及びガイドラインを遵守します" })
      .first();
    const agreeInput = agree.locator('input[type="checkbox"]');
    for (let i = 0; i < 3 && !(await agreeInput.isChecked()); i++) {
      await agree.locator("label").click();
      await page.waitForTimeout(300);
    }
    if (!(await agreeInput.isChecked())) {
      throw new Error(
        "reins: 規程・ガイドライン遵守のチェックが入らないため、ログインを送信しない",
      );
    }
    await page.getByRole("button", { name: "ログイン" }).click();
    await page
      .waitForURL((u) => !u.pathname.startsWith("/login/"), { timeout: 30_000 })
      .catch(() => undefined);
    await waitSettled(page);
    await throwIfChallenge(page);
    if (isLoginPage(await page.content(), page.url())) {
      // 同時ログインの確認ダイアログは 2026-10-14 時点で出ていない（出たら文言を記録する）
      const alert = await page
        .locator(".alert, .p-note-danger, .text-danger")
        .allInnerTexts()
        .catch(() => []);
      throw new Error(`reins: ログインに失敗しました: ${squash(alert.join(" ")).slice(0, 200)}`);
    }
    mainMenuUrl = page.url();
  },

  isLoggedOut: (html, url) => isLoginPage(html, url),

  async fetchList(ctx, url) {
    const page = requirePage(ctx);
    const s = parseSearchUrl(url);
    if (s.page === 1) {
      const { count } = await runSearch(page, s);
      if (count === 0 || hooks.precheckOnly) return EMPTY_LIST_MARKER;
    } else {
      // 2ページ目以降は表示中の検索結果のページ送り（一覧の API が1ページ50件ずつ返す）
      if (currentSearchKey !== searchKey(s)) {
        throw new Error(`reins: ${s.page} ページ目の前に同じ条件の検索が必要: ${url}`);
      }
      await showResultPage(page, s);
    }
    if (!lastListJson) throw new Error("reins: 一覧の JSON が取れていない");
    return lastListJson;
  },

  async fetchDetail(ctx, item) {
    const page = requirePage(ctx);
    const id = item.sourceListingId;
    // 詳細は「いま表示中の検索結果一覧のページ」の行の【詳細】から開く（meta.detailsAfterEachListPage）
    if (!lastListIds.includes(id)) throw new Error(`reins: 表示中の一覧に ${id} がない`);
    const row = page.locator(".p-table-body-row").filter({
      has: page.locator(".p-table-body-item", { hasText: new RegExp(`^\\s*${id}\\s*$`) }),
    });
    const button = row.getByRole("button", { name: /^\s*詳細\s*$/ });
    if ((await button.count()) === 0) throw new Error(`reins: 一覧に ${id} の行がない`);
    const detailRes = page.waitForResponse(
      (r) => /\/api\/BK\/GBK003\d00\/getInitData/.test(r.url()) && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    const urlBefore = page.url();
    await button.first().click();
    const res = await detailRes;
    if (!res.ok()) throw new Error(`reins: 詳細の取得に失敗: HTTP ${res.status()}`);
    await page
      .locator(".p-label-title", { hasText: "物件番号" })
      .first()
      .waitFor({ timeout: 30_000 });
    await waitSettled(page);
    await step(`detail-${id}`);
    const html = await page.content();
    await hooks.onDetail?.(id, html, page.url(), false, urlBefore);
    // ブラウザの「戻る」で一覧に戻る（一覧の API は呼ばれない＝再検索・課金にならない。2026-10-14 確認）
    await page.goBack();
    await page.locator(".p-table-body-row").first().waitFor({ timeout: 30_000 });
    await hooks.onBack?.(
      await page
        .locator(".pagination .page-item.active")
        .first()
        .innerText()
        .catch(() => "?"),
      shownPage,
    );
    return html;
  },

  parseList: parseListJson,

  parseDetail(html, url) {
    const fields = extractLabelValues(html);
    const fromUrl = url.startsWith("reins:") ? new URL(url).searchParams : null;
    const id = fields.物件番号?.match(BUKKEN_NO)?.[1] ?? fromUrl?.get("id");
    if (!id) throw new Error(`reins: 物件番号が取れない: ${url}`);
    if (fromUrl?.get("deal")) fields.__deal = fromUrl.get("deal") ?? "";
    // 写真: 物件詳細でのみ閲覧でき「プリントアウト・保存はできません」と注意書きがある。
    //   画面上も <img> ではなく認証付き API（/main/api/KG/GKG010100/findBkknGzu?...）で描画されるため取得しない。
    //   通知では物件の存在と条件だけを伝え、写真は他ソース（ポータル・自社サイト）の名寄せで補う
    return { sourceListingId: id, url, fields, imageUrls: [] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const kind = pick(f, ["物件種別", "物件種目"]) ?? "";
    const dealType: DealType =
      f.__deal === "sale" || f.__deal === "rent" ? f.__deal : /売/.test(kind) ? "sale" : "rent";
    // 項目名は 2026-10-14 の実物（賃貸マンション）。売買は 価格・専有面積・修繕積立金 の想定
    const priceText = dealType === "rent" ? pick(f, ["賃料"]) : pick(f, ["価格", "売買価格"]);
    const price = parseYen(priceText);
    if (price == null || price <= 0)
      throw new Error(`reins: 価格/賃料が解釈できない: ${priceText}`);

    const addressRaw = ["都道府県名", "所在地名1", "所在地名2", "所在地名3"]
      .map((k) => f[k] ?? "")
      .join("");
    const addr = splitAddress(addressRaw);
    const kanri = yenOrNone(f.管理費);
    const kyoeki = yenOrNone(f.共益費);
    // 間取タイプ "LDK" ＋ 間取部屋数 "2室" → 2LDK（ワンルームは部屋数なしで 1R）
    const layoutType = f.間取タイプ ?? "";
    const rooms = f.間取部屋数?.match(/(\d+)/)?.[1];
    const layout = /ワンルーム/.test(layoutType)
      ? "1R"
      : parseLayout(rooms && layoutType ? `${rooms}${layoutType}` : layoutType);
    const { floor, totalFloors } = parseFloor(
      [
        f.所在階 ? `${f.所在階.match(/(地下)?\d+/)?.[0] ?? ""}階` : "",
        f.地上階層 ? `/${f.地上階層.match(/\d+/)?.[0] ?? ""}階建` : "",
      ].join(""),
    );
    const direction = pick(f, ["バルコニー方向"])?.trim() || null;
    const adText = pick(f, ["広告転載区分"]);
    const mode = pick(f, ["取引態様"]) ?? "";
    // 築年月 "2016年(平成28年)11月" は括弧の和暦を除いてから解釈する
    const built = f.築年月?.replace(/\([^)]*\)/g, "").replace(/\s+/g, "");

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      // 会員サイトの URL はエンドユーザーには開けない。物件番号を識別できる形だけ残す
      url: `${BASE_URL}/#bukken=${raw.sourceListingId}`,
      dealType,
      title: pick(f, ["建物名"]) ?? null,
      address: { ...addr, raw: addressRaw },
      stations: stationsOf(f),
      price,
      managementFee: kanri == null && kyoeki == null ? null : (kanri ?? 0) + (kyoeki ?? 0),
      deposit: monthsOrNone(pick(f, ["敷金", "保証金"]), price),
      keyMoney: monthsOrNone(pick(f, ["礼金", "権利金"]), price),
      layout,
      areaSqm: parseAreaSqm(pick(f, ["使用部分面積", "専有面積", "建物面積"])),
      builtYearMonth: parseBuiltYearMonth(built),
      floor,
      totalFloors,
      structure: STRUCTURES.find(([re]) => re.test(pick(f, ["建物構造"]) ?? ""))?.[1] ?? null,
      direction,
      features: [
        ...extractFeatures(
          [f["設備・条件・住宅性能等"], f["設備(フリースペース)"], f["条件(フリースペース)"]]
            .filter(Boolean)
            .join(","),
        ),
        ...directionFeatures(direction),
      ],
      transactionMode: TRANSACTION_MODES.find(([re]) => re.test(mode))?.[1] ?? "unknown",
      // 広告転載区分: 可 / 不可 / 広告可(但し要連絡) 等
      adAllowed: adText ? (/不可/.test(adText) ? false : /可/.test(adText) ? true : null) : null,
      agencyName: pick(f, ["商号"]) ?? null,
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(pick(f, ["変更年月日", "更新年月日", "登録年月日"])),
      repairReserveFee: dealType === "sale" ? yenOrNone(pick(f, ["修繕積立金"])) : null,
      propertyType: /マンション/.test(kind)
        ? "mansion"
        : /一戸建/.test(kind)
          ? "house"
          : /土地/.test(kind)
            ? "land"
            : dealType === "rent"
              ? "mansion"
              : null,
      extra: Object.fromEntries(
        Object.entries(f).filter(([k]) =>
          [
            "物件番号",
            "物件種目",
            "登録年月日",
            "現況",
            "入居時期",
            "建物賃貸借区分",
            "契約期間",
          ].includes(k),
        ),
      ),
    };
  },
});
