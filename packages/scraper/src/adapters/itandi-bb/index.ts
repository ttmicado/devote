import { createHash } from "node:crypto";
import {
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
 * ITANDI BB（業者間サイト, https://itandibb.com/）アダプターのたたき台。
 *
 * ★ 未検証: ログイン後の画面・API レスポンスは一度も見ていない。公開ログイン画面の実物、
 *   公開ヘルプセンター（Zendesk）、公開 JS バンドル（assets.itandibb.com）から組み立てた。
 *   `// TODO(verify):` の箇所は `npx tsx packages/scraper/src/explore.ts itandi-bb` の結果で確定させる。
 *
 * 分かっていること（2026-10-13 時点）:
 * - itandibb.com は React の SPA。未ログインだと itandi-accounts.com/login（Rails, OAuth風）へリダイレクト
 *   → 「2回目以降ログイン」フォーム（email / password / authenticity_token）→ itandibb.com に戻る
 * - 画面のデータは JSON API（https://api.itandibb.com/api/internal/...）から取っている（cookie 認証）
 *   - 一覧: POST /api/internal/v4/rent_room_buildings/search （filter: {"address:in": [...], ...}）
 *     レスポンスは { buildings: [{ ..., rooms: [...] }], total_count, room_total_count } の形
 *   - 詳細: GET  /api/internal/v4/rent_rooms/{id}
 *   - 物件資料（図面）PDF: /api/internal/rent_residential_rooms/{id}/brokerage_company_obi_document 等
 *   → HTML をパースせず、画面操作で発生した API レスポンス（JSON）を横取りしてパースする
 * - ヘルプ「【重要】ITANDI BB の安全なご利用とデータ取得に関するお願い」(2026-09): クローリング等による
 *   自動的・継続的な大量取得は ITANDISYSTEM 利用規約 第27条でお控えいただくよう求めている
 *   → 巡回は最小限の頻度・件数にとどめる。運用判断は docs/member-sites.md 参照
 */
export const VERIFIED = false;

export const SOURCE_ID = "itandi-bb";
export const BASE_URL = "https://itandibb.com";
export const LOGIN_URL = `${BASE_URL}/`;
export const API_BASE = "https://api.itandibb.com/api/internal";
/** TODO(verify): 賃貸「部屋」リスト検索画面のパス（JS のルート定義では /rent_rooms/list） */
export const RENT_LIST_PATH = "/rent_rooms/list";
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const hooks: { onStep?: (step: string) => Promise<void> } = {};
const step = async (name: string) => {
  await hooks.onStep?.(name).catch(() => undefined);
};

let currentSearchKey: string | null = null;

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function credentials(): { email: string; password: string } {
  const email = process.env.ITANDI_EMAIL;
  const password = process.env.ITANDI_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "itandi-bb: 環境変数 ITANDI_EMAIL / ITANDI_PASSWORD が未設定です。.env に設定してください（コミットしない）",
    );
  }
  return { email, password };
}

function requirePage(ctx: FetchContext): Page {
  if (!ctx.page) throw new Error("itandi-bb: browser モードの FetchContext（ctx.page）が必要です");
  return ctx.page;
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

const isSearchResponse = (r: Response) =>
  r.request().method() === "POST" &&
  /\/api\/internal\/v4\/rent_room_buildings\/search(\?|$)/.test(r.url());

async function jsonOf(r: Response, what: string): Promise<string> {
  if (r.status() === 401 || r.status() === 403) {
    throw new Error(`itandi-bb: ${what} が ${r.status()}（セッション切れ or 権限なし）`);
  }
  if (!r.ok()) throw new Error(`itandi-bb: ${what} が HTTP ${r.status()}`);
  return r.text();
}

// ---------------------------------------------------------------------------
// 検索クエリ（擬似URL）
// ---------------------------------------------------------------------------

export interface ItandiSearch {
  prefecture: string;
  city: string;
  town: string | null;
  page: number;
}

export function buildSearchUrl(s: Omit<ItandiSearch, "page"> & { page?: number }): string {
  const p = new URLSearchParams({ deal: "rent", pref: s.prefecture, city: s.city });
  if (s.town) p.set("town", s.town);
  if (s.page && s.page > 1) p.set("page", String(s.page));
  return `itandi-bb://search?${p.toString()}`;
}

export function parseSearchUrl(url: string): ItandiSearch {
  const u = new URL(url);
  if (u.protocol !== "itandi-bb:") throw new Error(`itandi-bb: 検索の擬似URLではない: ${url}`);
  const city = u.searchParams.get("city");
  if (!city) throw new Error(`itandi-bb: 不正な検索URL: ${url}`);
  return {
    prefecture: u.searchParams.get("pref") ?? "東京都",
    city,
    town: u.searchParams.get("town"),
    page: Number(u.searchParams.get("page") ?? "1"),
  };
}

const searchKey = (s: ItandiSearch) => `${s.prefecture}|${s.city}|${s.town ?? ""}`;

/** 実在の詳細画面 URL（JS のルート定義 `/rent_rooms/${id}`）。TODO(verify) */
export const detailUrlOf = (id: string) => `${BASE_URL}/rent_rooms/${id}`;

// ---------------------------------------------------------------------------
// 画面操作
// ---------------------------------------------------------------------------

async function runSearch(page: Page, s: ItandiSearch): Promise<string> {
  await page.goto(`${BASE_URL}${RENT_LIST_PATH}`, { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await step("search-form");
  // 所在地: SearchAddressFormButton → 都道府県 → 市区町村 → 町名 のモーダル（JS から推測）
  // TODO(verify): ボタン/モーダルの表記
  await page
    .getByRole("button", { name: /所在地/ })
    .first()
    .click();
  await page.getByText(s.prefecture, { exact: true }).first().click();
  await page.getByLabel(s.city, { exact: true }).check();
  if (s.town) {
    const town = page.getByLabel(new RegExp(`^${s.town}`));
    if ((await town.count()) > 0) for (const t of await town.all()) await t.check();
  }
  await page
    .getByRole("button", { name: /決定|確定|OK/ })
    .first()
    .click();
  await step("search-filled");
  const [res] = await Promise.all([
    page.waitForResponse(isSearchResponse, { timeout: 60_000 }),
    page
      .getByRole("button", { name: /^\s*検索/ })
      .first()
      .click(),
  ]);
  const body = await jsonOf(res, "物件検索");
  await waitSettled(page);
  currentSearchKey = searchKey(s);
  await step("list");
  return body;
}

async function goToResultPage(page: Page, n: number): Promise<string> {
  // TODO(verify): PaginationWithCounter のページボタン
  const [res] = await Promise.all([
    page.waitForResponse(isSearchResponse, { timeout: 60_000 }),
    page
      .getByRole("button", { name: String(n), exact: true })
      .first()
      .click(),
  ]);
  const body = await jsonOf(res, `物件検索 ${n}ページ目`);
  await waitSettled(page);
  await step(`list-page-${n}`);
  return body;
}

// ---------------------------------------------------------------------------
// パーサ（純関数。入力は API の JSON 文字列。ログイン画面の HTML も判定できる）
// ---------------------------------------------------------------------------

export function isLoginPage(body: string, url: string): boolean {
  const u = new URL(url, BASE_URL);
  if (u.hostname === "itandi-accounts.com" && /^\/(login|users\/sign_in)/.test(u.pathname))
    return true;
  if (body.trimStart().startsWith("{")) return false;
  const $ = cheerio.load(body);
  const hasLoginForm =
    $('form[action="/login"] input[name="password"]').length > 0 ||
    $('form[action$="/login"] input[type="password"]').length > 0;
  return hasLoginForm || /ITANDI BBログインページ/.test($("title").text());
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

function parseJson(body: string, what: string): Json {
  try {
    const v: unknown = JSON.parse(body);
    if (isObj(v)) return v;
  } catch {
    // fallthrough
  }
  throw new Error(`itandi-bb: ${what} が JSON ではない（ログイン切れ・構造変化の可能性）`);
}

export function parseListJson(body: string, url: string) {
  const s = parseSearchUrl(url);
  const json = parseJson(body, "一覧");
  const buildings = json.buildings;
  if (!Array.isArray(buildings)) throw new Error("itandi-bb: 一覧 JSON に buildings がない");
  const items: ListItem[] = [];
  for (const b of buildings) {
    if (!isObj(b) || !Array.isArray(b.rooms)) continue;
    for (const r of b.rooms) {
      // TODO(verify): 部屋の ID キー（JS では property_id を多用）
      const id = isObj(r) ? (str(r.property_id) ?? str(r.id)) : undefined;
      if (!id || !isObj(r)) continue;
      items.push({
        sourceListingId: id,
        detailUrl: detailUrlOf(id),
        listHash: sha1(
          [
            r.rent_text,
            r.kanrihi_text,
            r.status_type,
            r.offer_conditions_update_elapsed,
            r.layout_text,
          ]
            .map((v) => str(v) ?? "")
            .join("|"),
        ),
        price:
          typeof r.rent_yen === "number" ? r.rent_yen : (parseYen(str(r.rent_text)) ?? undefined),
      });
    }
  }
  // TODO(verify): 1ページの件数（ヘルプ: 建物表示は1ページ20棟）と total_count の意味（棟数か部屋数か）
  const totalRooms = typeof json.room_total_count === "number" ? json.room_total_count : null;
  const totalBuildings = typeof json.total_count === "number" ? json.total_count : null;
  const perPage = 20;
  const hasNext = totalBuildings != null && s.page * perPage < totalBuildings;
  return {
    items,
    nextPageUrl: hasNext ? buildSearchUrl({ ...s, page: s.page + 1 }) : null,
    // 1棟の部屋が一覧で省略される（more_rooms_exist）ことがあるため、部屋数の一致は保証されない
    totalCount: totalRooms,
  };
}

/** 詳細 JSON（GET v4/rent_rooms/{id}）を「表記どおりの文字列」のフラットな fields にする */
export function flattenRoomJson(room: Json): Record<string, string> {
  const fields: Record<string, string> = {};
  const visit = (v: unknown, prefix: string) => {
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === "string" || typeof x === "number"))
        fields[prefix] = v.join("\n");
      return;
    }
    if (isObj(v)) {
      for (const [k, child] of Object.entries(v)) visit(child, prefix ? `${prefix}.${k}` : k);
      return;
    }
    const s = str(v) ?? (typeof v === "boolean" ? String(v) : undefined);
    if (s != null && s !== "") fields[prefix] = s;
  };
  visit(room, "");
  return fields;
}

function imageUrlsOf(room: Json): string[] {
  // 写真: all_images[] / image_url / madori_image_url（キーは JS から推測。TODO(verify)）
  //   画像は CDN の署名付きURLか、cookie 必須のURLかが未確認。期限付きなら巡回時に
  //   同じブラウザコンテキストで取得して Vercel Blob に再アップロードし、その URL を使う方針。
  // 図面（物件資料）PDF: 一覧・詳細の「物件資料」→「仲介帯で出力」で PDF が保存される
  //   （API: rent_residential_rooms/{id}/brokerage_company_obi_document）。PDF は imageUrls に入れず、
  //   必要時に保存して Blob 化する。写真購入（3,300円/物件の従量課金）は使わない。
  const urls: string[] = [];
  const add = (v: unknown) => {
    const s = isObj(v) ? (str(v.url) ?? str(v.image_url) ?? str(v.large_url)) : str(v);
    if (s && /^https?:\/\//.test(s)) urls.push(s);
  };
  if (Array.isArray(room.all_images)) for (const img of room.all_images) add(img);
  add(room.madori_image_url);
  add(room.image_url);
  return [...new Set(urls)];
}

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "ITANDI BB",
    kind: "b2b",
    fetchMode: { list: "browser", detail: "browser" },
    requiresLogin: true,
    // 運営が自動取得に注意喚起しているため、他より間隔を広く・頻度を低くする
    rateLimit: { minIntervalMs: 8000, maxConcurrency: 1 },
    schedule: { listCron: "25 9,13,18 * * *", detailRevisitHours: 72 },
    parserVersion: "0-unverified",
  },

  queries(): SearchQuery[] {
    // 賃貸のみ（売買メニューもあるが掲載は少ない。必要になったら sale_room_buildings/search を足す）
    return TARGET_AREAS.flatMap((a) =>
      (a.towns ?? [null]).map((town) => ({
        key: `rent-${a.city}${town ?? ""}`,
        params: { deal: "rent", prefecture: a.prefecture, city: a.city, ...(town ? { town } : {}) },
      })),
    );
  },

  buildListUrl: (q) =>
    buildSearchUrl({
      prefecture: String(q.params.prefecture ?? "東京都"),
      city: String(q.params.city),
      town: q.params.town ? String(q.params.town) : null,
    }),

  async login(ctx) {
    const { email, password } = credentials();
    const page = requirePage(ctx);
    await applyBrowserProfile(page);
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitSettled(page);
    if (!isLoginPage(await page.content(), page.url())) return; // 保存済みセッションで入れた
    await step("login-page"); // 入力前に撮る（スクショにIDを残さない）
    const form = page.locator('form[action="/login"]');
    // PC幅では入力欄が最初から見えている（2026-10-13 確認）。狭い画面では「2回目以降ログイン」の
    // アコーディオンを開く必要がある
    if (!(await form.locator('input[name="email"]').isVisible())) {
      await page.locator("#accordion-check-2").check({ force: true });
    }
    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    await Promise.all([
      page
        .waitForURL((u) => u.hostname === "itandibb.com", { timeout: 60_000 })
        .catch(() => undefined),
      form.locator('input[name="commit"]').click(),
    ]);
    await waitSettled(page);
    if (isLoginPage(await page.content(), page.url())) {
      const flash = await page
        .locator(".flash, .alert, .error, [role=alert]")
        .allInnerTexts()
        .catch(() => []);
      throw new Error(
        `itandi-bb: ログインに失敗しました: ${squash(flash.join(" ")).slice(0, 200)}`,
      );
    }
    if (/認証コード|確認コード|ワンタイム/.test(squash(await page.locator("body").innerText()))) {
      throw new Error("itandi-bb: 追加認証が求められました。自動では突破しません（人が対応）");
    }
  },

  isLoggedOut: (body, url) => !url.startsWith("itandi-bb:") && isLoginPage(body, url),

  async fetchList(ctx, url) {
    const page = requirePage(ctx);
    const s = parseSearchUrl(url);
    if (s.page === 1 || currentSearchKey !== searchKey(s)) {
      let body = await runSearch(page, { ...s, page: 1 });
      for (let n = 2; n <= s.page; n++) body = await goToResultPage(page, n);
      return body;
    }
    return goToResultPage(page, s.page);
  },

  async fetchDetail(ctx, item) {
    const page = requirePage(ctx);
    const apiPath = `/api/internal/v4/rent_rooms/${item.sourceListingId}`;
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "GET" && new URL(r.url()).pathname === apiPath,
        {
          timeout: 60_000,
        },
      ),
      page.goto(item.detailUrl, { waitUntil: "domcontentloaded" }),
    ]);
    const body = await jsonOf(res, "物件詳細");
    await waitSettled(page);
    await step(`detail-${item.sourceListingId}`);
    return body;
  },

  parseList: parseListJson,

  parseDetail(body, url) {
    const json = parseJson(body, "詳細");
    // TODO(verify): レスポンスが部屋オブジェクトそのものか、{ room: {...} } のような包みか
    const room = isObj(json.room) ? json.room : json;
    const id = str(room.property_id) ?? str(room.id) ?? url.match(/rent_rooms\/(\d+)/)?.[1];
    if (!id) throw new Error(`itandi-bb: 物件IDが取れない: ${url}`);
    return {
      sourceListingId: id,
      url,
      fields: flattenRoomJson(room),
      imageUrls: imageUrlsOf(room),
    };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    // TODO(verify): キー名はすべて公開 JS バンドルからの推測
    const price = f.rent_yen ? Number(f.rent_yen) : parseYen(f.rent_text);
    if (price == null || !Number.isFinite(price) || price <= 0) {
      throw new Error(`itandi-bb: 賃料が解釈できない: ${f.rent_yen ?? f.rent_text}`);
    }
    const yen = (n: string | undefined, text: string | undefined) =>
      n != null && n !== "" && Number.isFinite(Number(n)) ? Number(n) : parseYen(text);
    const kanri = yen(f.kanrihi_yen, f.kanrihi_text);
    const kyoeki = yen(f.kyoekihi_yen, f.kyoekihi_text);
    const addressRaw = f.address_text ?? f["building.address_text"] ?? "";
    const stations = (f.nearby_train_station_texts ?? "")
      .split("\n")
      .map((l) => parseStationAccess(l))
      .filter((s): s is StationAccess => s != null);
    const { floor, totalFloors } = parseFloor(
      [f.floor_text, f.story_text].filter(Boolean).join("/") || undefined,
    );
    const direction = f.main_lighting_direction_type_text ?? f.main_lighting_direction_text ?? null;
    const ad = f.advertisement_reprint_available_type ?? f.advertisable_type;
    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.building_name ?? f["building.name"] ?? null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price: Math.round(price),
      managementFee: kanri == null && kyoeki == null ? null : (kanri ?? 0) + (kyoeki ?? 0),
      deposit: f.shikikin_yen ? Number(f.shikikin_yen) : parseMonthsOrYen(f.shikikin_text, price),
      keyMoney: f.reikin_yen ? Number(f.reikin_yen) : parseMonthsOrYen(f.reikin_text, price),
      layout: parseLayout(f.layout_text ?? f.room_layout),
      areaSqm:
        parseAreaSqm(f.floor_area_text) ??
        (f.floor_area_amount ? Number(f.floor_area_amount) : null),
      builtYearMonth: parseBuiltYearMonth(f.construction_date_text ?? f.building_age_text),
      floor,
      totalFloors,
      // TODO(verify): structure_type は enum 値（"rc" 等）の可能性。表記に寄せて対応表を作る
      structure: f.structure_type_text ?? f.structure_type ?? null,
      direction,
      features: [
        ...extractFeatures(
          [f.all_options, f.custom_options, f.other_costs, f.memo_for_broker]
            .filter(Boolean)
            .join("\n"),
        ),
        ...directionFeatures(direction),
      ],
      // ITANDI BB は管理会社（元付）が直接掲載するサイト
      transactionMode: "unknown",
      // TODO(verify): advertisement_reprint_available_type の値（"available"/"unavailable" 等）
      adAllowed: ad ? (/un|not|不可/i.test(ad) ? false : /avail|可/i.test(ad) ? true : null) : null,
      agencyName: f.management_company_name ?? f["management_company.name"] ?? null,
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: null, // TODO(verify): 募集条件更新日のキー
      propertyType: "mansion",
      extra: Object.fromEntries(
        Object.entries(f).filter(([k]) =>
          [
            "status_type",
            "room_number",
            "kokokuhi_text",
            "viewing_available_from",
            "property_transfer_period_text",
          ].includes(k),
        ),
      ),
    };
  },
});
