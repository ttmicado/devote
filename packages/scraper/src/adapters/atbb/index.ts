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
 * ATBB（アットホーム 不動産業務総合支援サイト, https://atbb.athome.jp/）アダプターのたたき台。
 *
 * ★ 未検証: ログイン後の画面は一度も見ていない。公開ログイン画面の実物と公開FAQ・紹介記事から組み立てた。
 *   `// TODO(verify):` の箇所は `npx tsx packages/scraper/src/explore.ts atbb` の結果で確定させる。
 *
 * 分かっていること（2026-10-13 時点）:
 * - ログインフォームは通常の HTML フォーム: form[name=Frm_AtbbLogin] → POST https://members.athome.jp/login
 *   （loginId / password / hidden の div=kameiten, user_uuid, fromUrlParam）
 * - 送信ボタンは JS が 0.2秒ごとに ID/パスワードの入力を見て disabled を外す
 * - user_uuid は https://members.athome.jp/uuid から取得し、不正アクセス検知（fraud-alert.net の
 *   計測タグ）にセッションIDとして渡している → 端末・操作の挙動が監視されている前提で扱う
 * - FAQ No.186: 「同一のＩＤでは同時にログインできません」→ 人の操作と自動巡回でIDを分けること
 * - FAQ: 「セッションタイムアウトやATBBを終了しましたと表示されます」という画面がある（isLoggedOut で拾う）
 * - 検索方法: ダイレクト検索 / 都道府県からの所在地検索 / 地図検索 / 路線図 / 沿線 / フリーワード
 *   物件詳細では間取り・写真・図面（ファクトシート）が見られる。広告転載区分（転載可/不可/要確認）がある
 */
export const VERIFIED = false;

export const SOURCE_ID = "atbb";
export const BASE_URL = "https://atbb.athome.jp";
export const LOGIN_URL = `${BASE_URL}/`;
/** ログイン後のポータル（加盟店専用サイト） */
export const PORTAL_URL = "https://members.athome.jp/portal";
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const hooks: { onStep?: (step: string, page?: Page) => Promise<void> } = {};
/** 別タブで操作していることがあるので、いま操作中のページを渡して記録する */
const step = async (name: string) => {
  await hooks.onStep?.(name, activePage ?? undefined).catch(() => undefined);
};

/** ATBB はポップアップ（別ウィンドウ）で画面を開く可能性があるため、操作中のページを追跡する */
let activePage: Page | null = null;
let homeUrl: string | null = null;
let currentSearchKey: string | null = null;

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function credentials(): { userId: string; password: string } {
  const userId = process.env.ATBB_USER_ID;
  const password = process.env.ATBB_PASSWORD;
  if (!userId || !password) {
    throw new Error(
      "atbb: 環境変数 ATBB_USER_ID / ATBB_PASSWORD が未設定です。.env に設定してください（コミットしない）",
    );
  }
  return { userId, password };
}

function requirePage(ctx: FetchContext): Page {
  if (!ctx.page) throw new Error("atbb: browser モードの FetchContext（ctx.page）が必要です");
  if (activePage?.isClosed()) activePage = null;
  return activePage ?? ctx.page;
}

const profiled = new WeakSet<object>();
export async function applyBrowserProfile(page: Page): Promise<void> {
  const context = page.context();
  if (profiled.has(context)) return;
  profiled.add(context);
  await context.setExtraHTTPHeaders({ "User-Agent": BROWSER_UA });
  await context.addInitScript((ua: string) => {
    Object.defineProperty(navigator, "userAgent", { get: () => ua });
  }, BROWSER_UA);
}

async function waitSettled(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

/** クリックして、別ウィンドウが開けばそちらに切り替える */
async function clickMaybePopup(
  page: Page,
  target: ReturnType<Page["locator"]>,
  opts: { dispatch?: boolean } = {},
): Promise<Page> {
  const popupPromise = page
    .context()
    .waitForEvent("page", { timeout: 5_000 })
    .catch(() => null);
  if (opts.dispatch) await target.dispatchEvent("click");
  else await target.click();
  const popup = await popupPromise;
  const next = popup ?? page;
  await next.waitForLoadState("domcontentloaded").catch(() => undefined);
  await waitSettled(next);
  activePage = next;
  return next;
}

// ---------------------------------------------------------------------------
// 検索クエリ（擬似URL）
// ---------------------------------------------------------------------------

/** ATBB の物件種目グループ。TODO(verify): 実際のメニュー表記 */
const KIND_LABEL: Record<DealType, RegExp> = {
  rent: /賃貸居住用/,
  sale: /売買居住用|売マンション/,
};

export interface AtbbSearch {
  deal: DealType;
  prefecture: string;
  city: string;
  town: string | null;
  page: number;
}

export function buildSearchUrl(s: Omit<AtbbSearch, "page"> & { page?: number }): string {
  const p = new URLSearchParams({ deal: s.deal, pref: s.prefecture, city: s.city });
  if (s.town) p.set("town", s.town);
  if (s.page && s.page > 1) p.set("page", String(s.page));
  return `atbb://search?${p.toString()}`;
}

export function parseSearchUrl(url: string): AtbbSearch {
  const u = new URL(url);
  if (u.protocol !== "atbb:") throw new Error(`atbb: 検索の擬似URLではない: ${url}`);
  const deal = u.searchParams.get("deal");
  const city = u.searchParams.get("city");
  if ((deal !== "rent" && deal !== "sale") || !city) throw new Error(`atbb: 不正な検索URL: ${url}`);
  return {
    deal,
    prefecture: u.searchParams.get("pref") ?? "東京都",
    city,
    town: u.searchParams.get("town"),
    page: Number(u.searchParams.get("page") ?? "1"),
  };
}

const searchKey = (s: AtbbSearch) => `${s.deal}|${s.prefecture}|${s.city}|${s.town ?? ""}`;

// ---------------------------------------------------------------------------
// 画面操作
// ---------------------------------------------------------------------------

const bodyText = (page: Page) =>
  page
    .locator("body")
    .innerText({ timeout: 5_000 })
    .catch(() => "");

async function runSearch(start: Page, s: AtbbSearch): Promise<Page> {
  let page = start;
  if (homeUrl && page.url() !== homeUrl) {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded" });
    await waitSettled(page);
  }
  // ログイン後のポータル（members.athome.jp/portal）のヘッダー「物件・会社検索」→「流通物件検索」（別タブ）
  //   メニュー項目は data-action="/atbb/nyushuSearch?..."（target=_blank）。そのパスを別タブで開く
  const tab = await page.context().newPage();
  await tab.goto(`${new URL(PORTAL_URL).origin}/atbb/nyushuSearch?from=global_menu_bukkenKensaku`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await waitSettled(tab);
  activePage = tab;
  page = tab;
  // 転送先の URL にセッションID（;jsessionid=…）が付くと「request rejected: path contains matrix parameter
  //   separator」で弾かれる（2026-10-15 実測）。Cookie は付いているので、セッションIDを外して開き直す
  if (/;jsessionid=/i.test(page.url()) && /request rejected/i.test(await bodyText(page))) {
    await page.goto(page.url().replace(/;jsessionid=[^?#/]*/i, ""), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await waitSettled(page);
  }
  // 同じIDで人が ATBB を使っていると ConcurrentLoginException.jsp に飛ばされる（2026-10-14 実測）。
  //   人の作業を奪わないよう、ここで止める。巡回は一定時間（既定60分）待ってから自動で再開する
  //   （packages/pipeline/src/login-hold.ts）
  if (/ConcurrentLoginException/i.test(page.url())) {
    throw new Error(
      "atbb: 同じIDで別の端末が ATBB を利用中のため検索に入れません（ConcurrentLoginException）。時間をおいて再開します",
    );
  }
  await step("search-menu");
  // 物件種目（ラジオ name=atbbShumokuDaibunrui。賃貸居住用は value=06。2026-10-16 実画面で確認）
  const kind =
    s.deal === "rent"
      ? page.locator("input[name=atbbShumokuDaibunrui][value='06']")
      : // TODO(verify): 売買（売マンション）の value。表記で選ぶ
        page.locator("label", { hasText: KIND_LABEL.sale }).locator("input[type=radio]");
  await kind.first().check();
  await waitSettled(page);
  // 「所在地/沿線から探す」で都道府県（既定で東京都にチェック）→【所在地検索】で市区町村の選択へ
  const pref = page
    .locator("label", { hasText: new RegExp(`^\\s*${s.prefecture}\\s*$`) })
    .locator("input[type=checkbox]");
  if ((await pref.count()) > 0 && !(await pref.first().isChecked())) await pref.first().check();
  await Promise.all([
    page.waitForNavigation({ timeout: 30_000 }).catch(() => undefined),
    page.locator("input[type=button][value='所在地検索']").click(),
  ]);
  await waitSettled(page);
  // 市区町村は複数選択の select（name=sentaku1Shikugun）。選択肢は「港区(2,408件)」のように件数つき
  const cities = page.locator("select[name=sentaku1Shikugun]:visible").first();
  const label = (await cities.locator("option").allInnerTexts()).find((t) =>
    new RegExp(`^${s.city}\\(`).test(t.trim()),
  );
  if (!label) throw new Error(`atbb: 市区町村「${s.city}」が選択肢にない`);
  await cities.selectOption({ label });
  await step("search-area");
  if (s.town) {
    // 【選択 >>】で町村の一覧（select name=sentaku1Choson）が出る
    // TODO(verify): 町村の選択肢の表記（「勝どき(…件)」か、丁目ごとか）
    await page.locator("input[type=button][value='選択 >>']").first().click();
    await waitSettled(page);
    const towns = page.locator("select[name=sentaku1Choson]").first();
    const labels = (await towns.locator("option").allInnerTexts())
      .map((t) => t.trim())
      .filter((t) => t.startsWith(s.town as string));
    if (labels.length > 0) await towns.selectOption(labels.map((l) => ({ label: l })));
  }
  // 【条件入力画面へ】で賃料・面積などの条件入力へ（bfcm360s004。賃料 chinryoChokusetsuNyuryokuFrom/To、
  //   専有面積 senyuMensekiChokusetsuNyuryokuFrom/To、間取り madoriKubun。2026-10-17 実画面で確認）
  await Promise.all([
    page.waitForNavigation({ timeout: 30_000 }).catch(() => undefined),
    page.locator("input[type=button][value='条件入力画面へ']").click(),
  ]);
  await waitSettled(page);
  // 【検索】は画像認証つき（submitActionWithImgAuthCheck、hidden imgAuthCheckAriFlag=true。2026-10-17 実画面で確認）。
  //   画像認証は自動で突破しない約束（docs/operations.md）なので、ここで止める（巡回は24時間待つ）
  const imgAuth = await page
    .locator("input[name=imgAuthCheckAriFlag]")
    .first()
    .getAttribute("value")
    .catch(() => null);
  if (imgAuth === "true") {
    throw new Error("atbb: 検索に画像認証が必要（自動では突破しない。人が対応）");
  }
  await step("search-filled");
  page = await clickMaybePopup(page, page.getByRole("button", { name: /検索/ }).last());
  currentSearchKey = searchKey(s);
  await step("list");
  return page;
}

async function goToResultPage(page: Page, n: number) {
  // TODO(verify): ページ送り
  await page
    .getByRole("link", { name: String(n), exact: true })
    .first()
    .click();
  await waitSettled(page);
  await step(`list-page-${n}`);
}

// ---------------------------------------------------------------------------
// パーサ（純関数）
// ---------------------------------------------------------------------------

export function isLoginPage(html: string, url: string): boolean {
  const u = new URL(url, BASE_URL);
  if (u.hostname === "members.athome.jp" && u.pathname.startsWith("/login")) return true;
  const $ = cheerio.load(html);
  if ($('form[name="Frm_AtbbLogin"]').length > 0) return true;
  const text = squash($("body").text());
  // FAQ「セッションタイムアウトやATBBを終了しましたと表示されます」。TODO(verify): 実際の文言
  return /セッションタイムアウト|ATBBを終了しました|再度ログインしてください/.test(text);
}

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
  return fields;
}

const pick = (f: Record<string, string>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = f[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
};

// TODO(verify): ATBB の物件番号の桁数（athome の物件番号は10桁前後）
const BUKKEN_NO = /(?<!\d)(\d{10,13})(?!\d)/;

export function parseListHtml(html: string, url: string) {
  const s = parseSearchUrl(url);
  const $ = cheerio.load(html);
  const text = squash($("body").text());
  const items = new Map<string, ListItem>();
  // TODO(verify): 一覧の行。詳細へのリンクを持つ最小の行を1物件とみなす
  $("tr, li, .bukken, .property").each((_, el) => {
    const $el = $(el);
    if ($el.find("tr, li").length > 0) return;
    const link = $el
      .find("a")
      .filter((_, a) => /詳細|物件番号|bukken/i.test(`${$(a).text()} ${$(a).attr("href") ?? ""}`));
    const rowText = squash($el.text());
    const id = (rowText.match(/物件番号\s*[:：]?\s*(\d{10,13})/) ?? rowText.match(BUKKEN_NO))?.[1];
    if (!id || items.has(id) || link.length === 0) return;
    const href = link.first().attr("href");
    const priceText = rowText.match(/(\d[\d,.]*\s*(?:億\s*\d[\d,.]*\s*)?万円)/)?.[1];
    items.set(id, {
      sourceListingId: id,
      detailUrl:
        href && /^https?:|^\//.test(href)
          ? new URL(href, BASE_URL).toString()
          : `atbb://detail?${new URLSearchParams({ id, deal: s.deal }).toString()}`,
      listHash: sha1(rowText),
      price: parseYen(priceText) ?? undefined,
    });
  });
  const total = text.match(/(\d[\d,]*)\s*件(?:中|が見つかりました|ヒット)/)?.[1];
  const empty = /該当する物件(?:は|が)ありません|0\s*件/.test(text);
  if (items.size === 0 && !empty)
    throw new Error(`atbb: 一覧から物件が取れない（構造が想定と違う）: ${url}`);
  const nextLabel = String(s.page + 1);
  const hasNext =
    $("a")
      .toArray()
      .some(
        (a) => squash($(a).text()) === nextLabel || /^次(へ|の\d+件)/.test(squash($(a).text())),
      ) && items.size > 0;
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

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "ATBB（アットホーム）",
    kind: "b2b",
    fetchMode: { list: "browser", detail: "browser" },
    requiresLogin: true,
    rateLimit: { minIntervalMs: 5000, maxConcurrency: 1 },
    schedule: { listCron: "20 8,11,14,17,20 * * *", detailRevisitHours: 48 },
    parserVersion: "0-unverified",
  },

  queries(): SearchQuery[] {
    // ATBB は賃貸が中心だが売買（居住用）も流通している。両方を対象にする
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
    if (!ctx.page) throw new Error("atbb: browser モードの FetchContext（ctx.page）が必要です");
    const page = ctx.page;
    activePage = page;
    await applyBrowserProfile(page);
    // 保存済みセッションが生きていればポータルが開く（atbb.athome.jp はログイン中でもログイン画面を出す）
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitSettled(page);
    if (!isLoginPage(await page.content(), page.url())) {
      homeUrl = page.url();
      return;
    }
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitSettled(page);
    await step("login-page"); // 入力前に撮る（スクショにIDを残さない）
    await page.locator("#loginFormText").fill(userId);
    await page.locator("#passFormText").fill(password);
    // 入力監視の JS が disabled を外すまで待つ
    await page.locator("#loginSubmit:not([disabled])").waitFor({ timeout: 5_000 });
    await Promise.all([
      page.waitForNavigation({ timeout: 60_000 }).catch(() => undefined),
      page.locator("#loginSubmit").click(),
    ]);
    await waitSettled(page);
    const html = await page.content();
    if (isLoginPage(html, page.url())) {
      // TODO(verify): 同時ログイン・ID/パスワード誤り・追加認証の各文言
      const text = squash(cheerio.load(html)("body").text());
      const hint = text.match(/[^。]*(ログイン|認証|パスワード)[^。]*。/)?.[0] ?? "";
      throw new Error(`atbb: ログインに失敗しました: ${hint.slice(0, 200)}`);
    }
    if (/認証コード|ワンタイム|確認コード/.test(squash(cheerio.load(html)("body").text()))) {
      throw new Error(
        "atbb: 追加認証（確認コード）が求められました。自動では突破しません（人が対応）",
      );
    }
    homeUrl = page.url();
  },

  isLoggedOut: (html, url) =>
    url.startsWith("atbb:") ? isLoginPage(html, BASE_URL) : isLoginPage(html, url),

  // ポータルからログアウトしても ATBB（atbb.athome.co.jp）側のセッションは残り、次のログインで
  //   「他のユーザーがATBBを利用中です」（ConcurrentLoginException）になる（2026-10-16 実測。人も入れなくなる）。
  //   先に ATBB のヘッダーの「ログアウト」（submitAction(…, '../j_acegi_logout')）で ATBB を抜け、次にポータルを抜ける
  async logout(ctx) {
    const pages = ctx.page ? ctx.page.context().pages() : [];
    let atbbError: unknown = null;
    for (const p of pages) {
      if (p.isClosed() || !/atbb\.athome\.co\.jp/.test(p.url())) continue;
      const link = p.locator("a[onclick*='j_acegi_logout']").first();
      if ((await link.count()) === 0) continue;
      try {
        // ヘッダーのメニュー内にあり非表示のことがある（2026-10-16 実測。click は表示待ちで時間切れになる）。
        // onclick を直接発火させる
        await Promise.all([
          p.waitForNavigation({ timeout: 30_000 }).catch(() => undefined),
          link.dispatchEvent("click", undefined, { timeout: 10_000 }),
        ]);
        await waitSettled(p);
      } catch (e) {
        // ATBB 側で失敗しても、ポータルのログアウトは必ず試す
        atbbError = e;
      }
    }
    const page = requirePage(ctx);
    if (!page.url().startsWith(PORTAL_URL)) {
      await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitSettled(page);
    }
    if (isLoginPage(await page.content(), page.url())) return;
    await Promise.all([
      page.waitForNavigation({ timeout: 30_000 }).catch(() => undefined),
      page.locator(".c-util__menu__logout button").first().click({ timeout: 10_000 }),
    ]);
    activePage = null;
    currentSearchKey = null;
    if (atbbError) {
      throw new Error(
        `atbb: ATBB 側のログアウトに失敗（ポータルからはログアウト済み）: ${atbbError instanceof Error ? atbbError.message : String(atbbError)}`,
      );
    }
  },

  async fetchList(ctx, url) {
    let page = requirePage(ctx);
    const s = parseSearchUrl(url);
    if (s.page === 1 || currentSearchKey !== searchKey(s)) {
      page = await runSearch(page, { ...s, page: 1 });
      for (let n = 2; n <= s.page; n++) await goToResultPage(page, n);
    } else {
      await goToResultPage(page, s.page);
    }
    return page.content();
  },

  async fetchDetail(ctx, item) {
    let page = requirePage(ctx);
    if (/^https?:/.test(item.detailUrl)) {
      // TODO(verify): 詳細URLを直接開けるか（セッション依存のトークン付きURLの可能性）
      const res = await ctx.get(item.detailUrl);
      await step(`detail-${item.sourceListingId}`);
      return res.body;
    }
    const row = page.locator("tr, li", { hasText: item.sourceListingId }).last();
    page = await clickMaybePopup(page, row.getByRole("link", { name: /詳細/ }).first());
    await step(`detail-${item.sourceListingId}`);
    const html = await page.content();
    // 詳細が別ウィンドウなら閉じて一覧に戻る
    if (page !== ctx.page && !page.isClosed()) {
      await page.close();
      activePage = null;
    }
    return html;
  },

  parseList: parseListHtml,

  parseDetail(html, url) {
    const fields = extractLabelValues(html);
    const fromUrl = url.startsWith("atbb:") ? new URL(url).searchParams : null;
    const id = fields.物件番号?.match(BUKKEN_NO)?.[1] ?? fromUrl?.get("id");
    if (!id) throw new Error(`atbb: 物件番号が取れない: ${url}`);
    if (fromUrl?.get("deal")) fields.__deal = fromUrl.get("deal") ?? "";
    // 写真・図面: 詳細の写真（間取り図含む）の <img src> を控える。会員サイトの画像はログインcookieが
    //   必要な可能性が高い → 取り込み時に同じブラウザコンテキストで取得して Vercel Blob に
    //   再アップロードし、その URL を imageUrls に入れる方針（巡回時にはダウンロードしない）。
    //   図面（ファクトシート/マイソク）は詳細画面の「図面」ボタンから PDF/画像で出る想定。
    //   TODO(verify): 図面の出力方式（PDF ダウンロードか新規ウィンドウの画像か）と、元付帯/自社帯の別
    const $ = cheerio.load(html);
    const imageUrls = $("img")
      .toArray()
      .map((img) => $(img).attr("data-src") ?? $(img).attr("src") ?? "")
      .filter((src) => src && !src.startsWith("data:"))
      .map((src) => new URL(src, BASE_URL).toString())
      .filter(
        (src) => /photo|image|img|madori|gazo/i.test(src) && !/(logo|icon|btn|common)/i.test(src),
      ); // TODO(verify)
    return { sourceListingId: id, url, fields, imageUrls: [...new Set(imageUrls)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const kind = pick(f, ["物件種目", "種目"]) ?? "";
    const dealType: DealType =
      f.__deal === "sale" || f.__deal === "rent" ? f.__deal : /売/.test(kind) ? "sale" : "rent";
    // TODO(verify): 項目名（アットホームの公開物件詳細の項目名に寄せた推測）
    const priceText =
      dealType === "rent" ? pick(f, ["賃料", "賃料(管理費等)"]) : pick(f, ["価格", "販売価格"]);
    const price = parseYen(priceText?.split(/[\n(（]/)[0]);
    if (price == null || price <= 0) throw new Error(`atbb: 価格/賃料が解釈できない: ${priceText}`);
    const [depositText, keyMoneyText] = (pick(f, ["敷金/礼金", "敷金／礼金"]) ?? "").split(/[／/]/);
    const addressRaw = pick(f, ["所在地", "住所"]) ?? "";
    const stations = (pick(f, ["交通", "沿線・駅"]) ?? "")
      .split("\n")
      .map((l) => parseStationAccess(l))
      .filter((s): s is StationAccess => s != null);
    const { floor, totalFloors } = parseFloor(
      pick(f, ["階建/階", "階建／階", "所在階/階建", "階数"]),
    );
    const direction = pick(f, ["向き", "主要採光面", "バルコニー方向"])?.trim() || null;
    const adText = pick(f, ["広告転載", "広告転載区分", "広告掲載"]);
    const mode = pick(f, ["取引態様"]) ?? "";
    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: /^https?:/.test(raw.url) ? raw.url : `${BASE_URL}/#bukken=${raw.sourceListingId}`,
      dealType,
      title: pick(f, ["建物名", "物件名"]) ?? null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: parseYen(pick(f, ["管理費等", "管理費", "共益費", "管理費・共益費"])),
      deposit: parseMonthsOrYen(pick(f, ["敷金"]) ?? depositText, price),
      keyMoney: parseMonthsOrYen(pick(f, ["礼金"]) ?? keyMoneyText, price),
      layout: parseLayout(pick(f, ["間取り", "間取"])),
      areaSqm: parseAreaSqm(pick(f, ["専有面積", "面積", "建物面積"])),
      builtYearMonth: parseBuiltYearMonth(pick(f, ["築年月", "完成時期(築年月)"])),
      floor,
      totalFloors,
      structure:
        STRUCTURES.find(([re]) => re.test(pick(f, ["構造", "建物構造"]) ?? ""))?.[1] ?? null,
      direction,
      features: [
        ...extractFeatures(pick(f, ["設備", "設備・条件", "条件等", "備考"]) ?? ""),
        ...directionFeatures(direction),
      ],
      transactionMode: TRANSACTION_MODES.find(([re]) => re.test(mode))?.[1] ?? "unknown",
      // 元付の設定は「転載可・転載不可・要確認」
      adAllowed: adText
        ? /不可/.test(adText)
          ? false
          : /要確認/.test(adText)
            ? null
            : /可/.test(adText)
              ? true
              : null
        : null,
      agencyName: pick(f, ["元付業者", "商号", "会社名"]) ?? null,
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(pick(f, ["情報更新日", "更新日", "登録日"])),
      repairReserveFee: dealType === "sale" ? parseYen(pick(f, ["修繕積立金"])) : null,
      propertyType:
        /マンション/.test(kind) || dealType === "rent"
          ? "mansion"
          : /戸建/.test(kind)
            ? "house"
            : /土地/.test(kind)
              ? "land"
              : null,
      extra: Object.fromEntries(
        Object.entries(f).filter(([k]) => ["物件番号", "物件種目", "現況", "入居時期"].includes(k)),
      ),
    };
  },
});
