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
import type { Page } from "playwright";
import {
  defineAdapter,
  type FetchContext,
  type ListItem,
  type SearchQuery,
} from "../../adapter.js";

/**
 * レインズ（REINS IP型 / 4機構共通システム, https://system.reins.jp/）アダプターのたたき台。
 *
 * ★ 未検証: ログイン後の画面は一度も見ていない。公開ログイン画面の実物と、公開マニュアル
 *   （近畿レインズ「新システム クイックマニュアル」2021/10 等。新システムは4機構共通）から組み立てた。
 *   `// TODO(verify):` の箇所は `npx tsx packages/scraper/src/explore.ts reins` の結果で確定させる。
 *   詳細は docs/member-sites.md。
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
export const VERIFIED = false;

export const SOURCE_ID = "reins";
export const BASE_URL = "https://system.reins.jp";
export const LOGIN_URL = `${BASE_URL}/login/main/KG/GKG001200`;
/** HeadlessChrome の UA だと 503 になるため、通常の Chrome の UA を名乗る */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** explore.ts から各画面のキャプチャを差し込むためのフック（本番では未設定） */
export const hooks: { onStep?: (step: string) => Promise<void> } = {};
const step = async (name: string) => {
  await hooks.onStep?.(name).catch(() => undefined);
};

/** ログイン直後の画面（メインメニュー）の URL。ログイン時に記録する */
let mainMenuUrl: string | null = null;
/** いま画面に出ている検索結果の検索キー（ページ送りの判定用） */
let currentSearchKey: string | null = null;

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

/** レインズの物件種別１（検索対象）。TODO(verify): 選択肢の表記 */
const PROPERTY_KIND: Record<DealType, string> = {
  rent: "賃貸マンション",
  sale: "売マンション",
};

export interface ReinsSearch {
  deal: DealType;
  prefecture: string;
  city: string;
  town: string | null;
  page: number;
}

export function buildSearchUrl(s: Omit<ReinsSearch, "page"> & { page?: number }): string {
  const p = new URLSearchParams({ deal: s.deal, pref: s.prefecture, city: s.city });
  if (s.town) p.set("town", s.town);
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
    page: Number(u.searchParams.get("page") ?? "1"),
  };
}

const searchKey = (s: ReinsSearch) => `${s.deal}|${s.prefecture}|${s.city}|${s.town ?? ""}`;

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
  // TODO(verify): reCAPTCHA の画像チャレンジ（bframe）が出たら自動突破せず止める
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

async function runSearch(page: Page, s: ReinsSearch) {
  await openMainMenu(page);
  // マニュアル: メインメニューの【賃貸 物件検索】/【売買 物件検索】。TODO(verify): 要素の種類と表記
  const entry = s.deal === "rent" ? /賃貸\s*物件検索/ : /売買\s*物件検索/;
  await page
    .getByRole("link", { name: entry })
    .or(page.getByRole("button", { name: entry }))
    .first()
    .click();
  await waitSettled(page);
  await step("search-form");

  // 物件種別１（必須）。TODO(verify): ラベル表記と select か独自コンポーネントか
  await afterLabel(page, /物件種別\s*[1１]/, "select").selectOption({
    label: PROPERTY_KIND[s.deal],
  });
  // 所在地は「入力ガイド」を使わず直接入力もできる（マニュアル P25）。TODO(verify): ラベル表記
  await afterLabel(page, /都道府県名/, "input").fill(s.prefecture);
  await afterLabel(page, /所在地名\s*[1１]/, "input").fill(s.city);
  if (s.town) {
    // 所在地名２は「〇丁目」を消すと町名全域になる（マニュアル P29）
    await afterLabel(page, /所在地名\s*[2２]/, "input").fill(s.town);
  }
  // TODO(verify): 差分巡回では「その他検索項目」の登録年月日/変更年月日「3日以内」等で絞ると
  //   1回あたりのヒット件数（と課金）を抑えられる
  await step("search-filled");

  // 件数事前確認（無課金）。500件超なら条件を分割する必要がある
  const precheck = page.getByRole("button", { name: /件数事前確認/ });
  if ((await precheck.count()) > 0) {
    await precheck.first().click();
    await waitSettled(page);
    await step("search-precheck");
    const text = squash(await page.locator("body").innerText());
    const m = text.match(/(\d[\d,]*)\s*件/);
    if (m?.[1] && Number(m[1].replace(/,/g, "")) > 500) {
      console.warn(
        `reins: ${searchKey(s)} のヒットが500件を超えています（上限500件で打ち切られる）`,
      );
    }
    // TODO(verify): 事前確認ダイアログの閉じ方
    await page
      .getByRole("button", { name: /閉じる|OK/ })
      .first()
      .click({ timeout: 3_000 })
      .catch(() => undefined);
  }

  await page
    .getByRole("button", { name: /^\s*検索\s*$/ })
    .first()
    .click();
  await waitSettled(page);
  await throwIfChallenge(page);
  currentSearchKey = searchKey(s);
  await step("list");
}

async function goToResultPage(page: Page, n: number) {
  // TODO(verify): ページ送りの UI（b-pagination のボタンの想定）
  const link = page.locator(".pagination, nav").getByText(String(n), { exact: true }).first();
  await link.click();
  await waitSettled(page);
  await step(`list-page-${n}`);
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

/** th/td・dt/dd・.p-label の「項目名 → 値」を集める（レインズの詳細画面の構造は未確認のため汎用） */
export function extractLabelValues(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  $("script, style").remove();
  $("br").replaceWith("\n");
  const fields: Record<string, string> = {};
  const put = (k: string, v: string) => {
    const key = squash(k).replace(/[:：]$/, "");
    const value = v
      .normalize("NFKC")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    if (key && value && key.length <= 30 && !(key in fields)) fields[key] = value;
  };
  $("tr").each((_, tr) => {
    const cells = $(tr).children("th, td").toArray();
    for (let i = 0; i + 1 < cells.length; i++) {
      const a = cells[i];
      const b = cells[i + 1];
      if (a && b && a.tagName === "th" && b.tagName === "td") put($(a).text(), $(b).text());
    }
  });
  $("dt").each((_, dt) => {
    put($(dt).text(), $(dt).next("dd").text());
  });
  // TODO(verify): 詳細画面が p-label + 値の 2カラム構成かどうか
  $(".p-label").each((_, el) => {
    const label = $(el).find(".p-label-title").text() || $(el).text();
    const value = $(el).parent().next().text() || $(el).next().text();
    put(label, value);
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

export function parseListHtml(html: string, url: string) {
  const s = parseSearchUrl(url);
  const $ = cheerio.load(html);
  const text = squash($("body").text());
  const items = new Map<string, ListItem>();

  // TODO(verify): 一覧の行要素。物件番号（12桁）を含む最小の行（tr / カード）を1物件とみなす
  $("tr, .card, .list-group-item").each((_, el) => {
    const $el = $(el);
    if ($el.find("tr, .card, .list-group-item").length > 0) return; // 入れ子の外側は飛ばす
    const rowText = squash($el.text());
    const id = rowText.match(BUKKEN_NO)?.[1];
    if (!id || items.has(id)) return;
    const priceText = rowText.match(/(\d[\d,.]*\s*(?:億\s*\d[\d,.]*\s*)?万円)/)?.[1];
    items.set(id, {
      sourceListingId: id,
      detailUrl: detailUrlOf(id, s.deal),
      listHash: sha1(rowText),
      price: parseYen(priceText) ?? undefined,
    });
  });

  const total =
    text.match(/[（(]\s*(\d[\d,]*)\s*件/)?.[1] ??
    text.match(/検索結果\s*[:：]?\s*(\d[\d,]*)\s*件/)?.[1];
  const empty = /該当する物件(?:情報)?(?:は|が)ありません|0\s*件/.test(text);
  if (items.size === 0 && !empty) {
    throw new Error(`reins: 一覧から物件番号が取れない（構造が想定と違う）: ${url}`);
  }
  // TODO(verify): 次ページの有無。ページ番号ボタンに page+1 があるか
  const nextLabel = String(s.page + 1);
  const hasNext = $(".pagination li, .pagination a, .pagination button")
    .toArray()
    .some((el) => squash($(el).text()) === nextLabel && !$(el).hasClass("disabled"));
  return {
    items: [...items.values()],
    nextPageUrl: hasNext ? buildSearchUrl({ ...s, page: s.page + 1 }) : null,
    totalCount: total ? Number(total.replace(/,/g, "")) : null,
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

function parseJpDate(v: string | undefined): string | null {
  const m = v?.normalize("NFKC").match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return new Date(
    `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00+09:00`,
  ).toISOString();
}

/** 沿線名1/駅名1/駅より徒歩1 … の組を「線「駅」駅 徒歩N分」にして parseStationAccess に渡す */
function stationsOf(f: Record<string, string>): StationAccess[] {
  const out: StationAccess[] = [];
  for (const suffix of ["", "1", "2", "3", "１", "２", "３"]) {
    const line = f[`沿線名${suffix}`];
    const station = f[`駅名${suffix}`];
    if (!station) continue;
    const walk = f[`駅より徒歩${suffix}`] ?? f[`徒歩${suffix}`];
    const walkMin = walk?.normalize("NFKC").match(/(\d+)/)?.[1];
    const s = parseStationAccess(
      `${line ?? ""}「${station.replace(/駅$/, "")}」駅${walkMin ? ` 徒歩${walkMin}分` : ""}`,
    );
    if (s && !out.some((o) => o.station === s.station && o.line === s.line)) out.push(s);
  }
  for (const line of (f.交通 ?? "").split("\n")) {
    const s = parseStationAccess(line);
    if (s) out.push(s);
  }
  return out;
}

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
    // 既定では 6,000 件を上限にして日割りで配分する（REINS_MONTHLY_*_LIMIT で変更可）
    monthlyQuota: {
      list: Number(process.env.REINS_MONTHLY_SEARCH_LIMIT ?? 6000),
      detail: Number(process.env.REINS_MONTHLY_DETAIL_LIMIT ?? 6000),
    },
    parserVersion: "0-unverified",
  },

  queries(): SearchQuery[] {
    const deals: DealType[] = ["rent", "sale"];
    return deals.flatMap((deal) =>
      TARGET_AREAS.flatMap((a) =>
        (a.towns ?? [null]).map((town) => ({
          key: `${deal}-${a.city}${town ?? ""}`,
          params: { deal, prefecture: a.prefecture, city: a.city, ...(town ? { town } : {}) },
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
    // カスタムチェックボックスは label をクリックしないと切り替わらない
    await page.getByText("所属機構の規程及びガイドラインを遵守します", { exact: true }).click();
    await page.getByRole("button", { name: "ログイン" }).click();
    await page
      .waitForURL((u) => !u.pathname.startsWith("/login/"), { timeout: 30_000 })
      .catch(() => undefined);
    await waitSettled(page);
    await throwIfChallenge(page);
    if (isLoginPage(await page.content(), page.url())) {
      // TODO(verify): 既存セッションがある場合の確認ダイアログ（同時ログイン）の文言
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
    if (s.page === 1 || currentSearchKey !== searchKey(s)) {
      await runSearch(page, { ...s, page: 1 });
      for (let n = 2; n <= s.page; n++) await goToResultPage(page, n);
    } else {
      await goToResultPage(page, s.page);
    }
    return page.content();
  },

  async fetchDetail(ctx, item) {
    const page = requirePage(ctx);
    const id = item.sourceListingId;
    // 1) いま表示中の一覧にその物件の行があれば【詳細】を押す
    const row = page.locator("tr, .card", { hasText: id }).last();
    const button = row
      .getByRole("button", { name: /詳細/ })
      .or(row.getByRole("link", { name: /詳細/ }));
    if ((await button.count()) > 0) {
      await button.first().click();
    } else {
      // 2) メインメニューの【物件番号検索】から開く。TODO(verify): 画面と課金の有無
      await openMainMenu(page);
      currentSearchKey = null;
      await page
        .getByRole("link", { name: /物件番号検索/ })
        .or(page.getByRole("button", { name: /物件番号検索/ }))
        .first()
        .click();
      await waitSettled(page);
      await afterLabel(page, /物件番号/, "input").fill(id);
      await page
        .getByRole("button", { name: /^\s*検索\s*$/ })
        .first()
        .click();
      await waitSettled(page);
      const detail = page.getByRole("button", { name: /詳細/ });
      if ((await detail.count()) > 0) await detail.first().click();
    }
    await waitSettled(page);
    await step(`detail-${id}`);
    return page.content();
  },

  parseList: parseListHtml,

  parseDetail(html, url) {
    const fields = extractLabelValues(html);
    const fromUrl = url.startsWith("reins:") ? new URL(url).searchParams : null;
    const id = fields.物件番号?.match(BUKKEN_NO)?.[1] ?? fromUrl?.get("id");
    if (!id) throw new Error(`reins: 物件番号が取れない: ${url}`);
    if (fromUrl?.get("deal")) fields.__deal = fromUrl.get("deal") ?? "";
    // 写真: 画像は物件詳細でのみ閲覧可で「保存できない」と公式に注意書きがある。
    //   http(s) の画像URLが取れた場合だけ控える（ログインが必要な可能性が高い。将来 Vercel Blob に
    //   再アップロードする前提）。blob:/data: で描画される場合は取れない → TODO(verify)
    // 図面: 一覧のチェックボックス＋【図面一括取得】で最大20件を1つのPDFとしてダウンロードできる
    //   （page.waitForEvent("download")）。PDF は1ファイルに複数物件が入るので imageUrls には入れず、
    //   別途保存してから Blob の URL を入れる方針。
    const $ = cheerio.load(html);
    const imageUrls = $("img")
      .toArray()
      .map((img) => $(img).attr("src") ?? "")
      .filter((src) => src && !src.startsWith("data:") && !src.startsWith("blob:"))
      .map((src) => new URL(src, BASE_URL).toString())
      .filter((src) => !/\/(img|app|css|favicon)/.test(new URL(src).pathname)); // TODO(verify)
    return { sourceListingId: id, url, fields, imageUrls };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const kind = pick(f, ["物件種別", "物件種目"]) ?? "";
    const dealType: DealType =
      f.__deal === "sale" || f.__deal === "rent" ? f.__deal : /売/.test(kind) ? "sale" : "rent";
    // TODO(verify): 詳細画面の項目名（以下は公開資料と一般的なレインズの項目名からの推測）
    const priceText =
      dealType === "rent"
        ? pick(f, ["賃料", "月額賃料"])
        : pick(f, ["価格", "売買価格", "価格（税込）"]);
    const price = parseYen(priceText);
    if (price == null || price <= 0)
      throw new Error(`reins: 価格/賃料が解釈できない: ${priceText}`);

    const addressRaw =
      pick(f, ["所在地"]) ??
      [
        "都道府県名",
        "所在地名１",
        "所在地名1",
        "所在地名２",
        "所在地名2",
        "所在地名３",
        "所在地名3",
      ]
        .map((k) => f[k] ?? "")
        .join("");
    const addr = splitAddress(addressRaw);
    const kanri = parseYen(pick(f, ["管理費"]));
    const kyoeki = parseYen(pick(f, ["共益費"]));
    const roomCount = pick(f, ["間取部屋数"]);
    const layoutText =
      pick(f, ["間取", "間取り"]) ?? `${roomCount ?? ""}${pick(f, ["間取タイプ"]) ?? ""}`;
    const floorNum = pick(f, ["所在階"])
      ?.normalize("NFKC")
      .match(/(地下)?(\d+)/);
    const totalNum = pick(f, ["地上階層", "階建"])?.normalize("NFKC").match(/(\d+)/)?.[1];
    const { floor, totalFloors } = parseFloor(
      `${floorNum ? `${floorNum[1] ?? ""}${floorNum[2]}階` : ""}${totalNum ? `/${totalNum}階建` : ""}`,
    );
    const direction = pick(f, ["バルコニー方向", "向き", "主要採光面"])?.trim() || null;
    const adText = pick(f, ["広告転載区分", "広告可否"]);
    const mode = pick(f, ["取引態様"]) ?? "";

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      // 会員サイトの URL はエンドユーザーには開けない。物件番号を識別できる形だけ残す
      url: `${BASE_URL}/#bukken=${raw.sourceListingId}`,
      dealType,
      title: pick(f, ["建物名", "建物名称"]) ?? null,
      address: { ...addr, raw: addressRaw },
      stations: stationsOf(f),
      price,
      managementFee: kanri == null && kyoeki == null ? null : (kanri ?? 0) + (kyoeki ?? 0),
      deposit: parseMonthsOrYen(pick(f, ["敷金"]), price),
      keyMoney: parseMonthsOrYen(pick(f, ["礼金"]), price),
      layout: parseLayout(layoutText),
      areaSqm: parseAreaSqm(pick(f, ["専有面積", "使用部分面積", "建物面積"])),
      builtYearMonth: parseBuiltYearMonth(pick(f, ["築年月"])),
      floor,
      totalFloors,
      structure:
        STRUCTURES.find(([re]) => re.test(pick(f, ["建物構造", "構造"]) ?? ""))?.[1] ?? null,
      direction,
      features: [
        ...extractFeatures(pick(f, ["設備・条件", "設備", "条件", "備考"]) ?? ""),
        ...directionFeatures(direction),
      ],
      transactionMode: TRANSACTION_MODES.find(([re]) => re.test(mode))?.[1] ?? "unknown",
      adAllowed: adText ? (/不可/.test(adText) ? false : /可/.test(adText) ? true : null) : null,
      agencyName: pick(f, ["商号", "会員名"]) ?? null,
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(pick(f, ["変更年月日", "更新年月日", "登録年月日"])),
      repairReserveFee: dealType === "sale" ? parseYen(pick(f, ["修繕積立金"])) : null,
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
          ["物件番号", "物件種目", "登録年月日", "取引状況"].includes(k),
        ),
      ),
    };
  },
});
