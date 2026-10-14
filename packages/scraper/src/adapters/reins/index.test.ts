import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import adapter, {
  buildSearchUrl,
  defaultPeriod,
  EMPTY_LIST_MARKER,
  extractLabelValues,
  LOGIN_URL,
  parseJpDate,
  parseSearchUrl,
  VERIFIED,
} from "./index.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");

describe("reins（2026-10-14 実画面で確認）", () => {
  it("検証済みフラグと会員サイト用の meta", () => {
    expect(VERIFIED).toBe(true);
    expect(adapter.meta).toMatchObject({
      fetchMode: { list: "browser", detail: "browser" },
      requiresLogin: true,
      parserVersion: "1",
      incrementalList: true,
      detailsAfterEachListPage: true,
    });
    expect(adapter.meta.rateLimit.minIntervalMs).toBeGreaterThanOrEqual(3000);
    expect(adapter.meta.rateLimit.maxConcurrency).toBe(1);
  });

  it("実物のログイン画面（2026-10-13 取得）をログアウト状態と判定する", () => {
    const html = fixture("login.html");
    expect(adapter.isLoggedOut?.(html, LOGIN_URL)).toBe(true);
    // URL が擬似URLでも HTML から判定できる
    expect(adapter.isLoggedOut?.(html, "reins://search?deal=rent&city=港区")).toBe(true);
  });

  it("ログイン画面でない HTML はログアウト扱いしない", () => {
    const html = "<html><body><h1>メインメニュー</h1><a>賃貸 物件検索</a></body></html>";
    expect(adapter.isLoggedOut?.(html, "https://system.reins.jp/main/KG/GKG003100")).toBe(false);
  });

  it("賃貸・売買 × 対象エリア（町名指定を含む）のクエリを作る", () => {
    const qs = adapter.queries();
    expect(qs).toHaveLength(12);
    const urls = qs.map((q) => adapter.buildListUrl(q));
    expect(urls.map((u) => parseSearchUrl(u))).toContainEqual(
      expect.objectContaining({ deal: "rent", city: "港区", town: null }),
    );
    expect(
      parseSearchUrl(adapter.buildListUrl(qs.find((q) => q.params.town === "勝どき") ?? qs[0]!)),
    ).toMatchObject({
      deal: "rent",
      prefecture: "東京都",
      city: "中央区",
      town: "勝どき",
      page: 1,
    });
  });

  describe("login", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("認証情報が未設定なら分かりやすいエラーで止まる（ブラウザ操作の前）", async () => {
      vi.stubEnv("REINS_USER_ID", "");
      vi.stubEnv("REINS_PASSWORD", "");
      await expect(
        adapter.login?.({ get: async () => ({ status: 0, body: "", url: "" }) }),
      ).rejects.toThrow(/REINS_USER_ID/);
    });
  });

  const rentUrl = buildSearchUrl({
    deal: "rent",
    prefecture: "東京都",
    city: "中央区",
    town: "勝どき",
    period: "today",
  });

  it("一覧: 1ページ目の API の JSON（実物・マスク済み）から物件番号と賃料を取る", () => {
    const r = adapter.parseList(fixture("list-rent-kachidoki.json"), rentUrl);
    expect(r.items).toHaveLength(7);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "100140840893",
      price: 900_000,
      detailUrl: "reins://detail?id=100140840893&deal=rent",
    });
    expect(r.totalCount).toBe(7);
    expect(r.nextPageUrl).toBeNull();
  });

  it("一覧: 2ページ目以降の API（getBkknListData）と次ページの判定（1ページ50件）", () => {
    const url = buildSearchUrl({
      deal: "rent",
      prefecture: "東京都",
      city: "港区",
      town: null,
      period: "today",
      page: 2,
    });
    const r = adapter.parseList(fixture("list-rent-minato-page2.json"), url);
    expect(r.items).toHaveLength(50);
    expect(r.totalCount).toBe(166);
    expect(r.nextPageUrl && parseSearchUrl(r.nextPageUrl)).toMatchObject({ city: "港区", page: 3 });
  });

  it("一覧: 件数事前確認が0件（検索しなかった）は空、JSON でなければ throw", () => {
    expect(adapter.parseList(EMPTY_LIST_MARKER, rentUrl)).toEqual({
      items: [],
      nextPageUrl: null,
      totalCount: 0,
    });
    expect(() => adapter.parseList("<body>なにか別の画面</body>", rentUrl)).toThrow(
      /構造が想定と違う/,
    );
  });

  it("一覧: 同じ行が変わらなければ listHash も変わらない（詳細の再取得を省く）", () => {
    const a = adapter.parseList(fixture("list-rent-kachidoki.json"), rentUrl);
    const b = adapter.parseList(fixture("list-rent-kachidoki.json"), rentUrl);
    expect(a.items.map((i) => i.listHash)).toEqual(b.items.map((i) => i.listHash));
  });

  const detail = (name: string, id: string, deal: "rent" | "sale") =>
    adapter.normalize(adapter.parseDetail(fixture(name), `reins://detail?id=${id}&deal=${deal}`));

  it("詳細（賃貸・実物）: 項目名と値を同じ列で対応づける（空の項目でずれない）", () => {
    const f = extractLabelValues(fixture("detail-rent-1.html"));
    expect(f).toMatchObject({
      物件番号: "100140840893",
      賃料: "90万円",
      使用部分面積: "100.05m2",
      所在地名1: "中央区",
      所在地名2: "勝どき5丁目",
      沿線名: "大江戸線",
      駅名: "勝どき",
      駅名2: "築地市場",
      駅名3: "月島",
      管理費: "なし",
      商号: "マスク済み",
    });
    expect(f.物件問合せ担当者).toBe("マスク済み");
  });

  it("詳細（賃貸・実物）を正規化する", () => {
    expect(detail("detail-rent-1.html", "100140840893", "rent")).toMatchObject({
      dealType: "rent",
      title: "勝どきザ・タワー",
      price: 900_000,
      managementFee: 0,
      deposit: 900_000,
      keyMoney: 900_000,
      address: { prefecture: "東京都", city: "中央区", town: "勝どき" },
      stations: [
        { line: "大江戸線", station: "勝どき", walkMinutes: 7 },
        { station: "築地市場", walkMinutes: 16 },
        { station: "月島", walkMinutes: 17 },
      ],
      layout: "2LDK",
      areaSqm: 100.05,
      builtYearMonth: "2016-11",
      floor: 18,
      totalFloors: 57,
      structure: "RC",
      transactionMode: "agent",
      adAllowed: false,
      imageUrls: [],
      sourceUpdatedAt: "2026-10-13T15:00:00.000Z",
    });
    expect(detail("detail-rent-2.html", "100140419002", "rent")).toMatchObject({
      price: 70_000,
      managementFee: 3_000,
      layout: "1R",
      areaSqm: 15.22,
      builtYearMonth: "1974-04",
      structure: "SRC",
      adAllowed: true,
    });
  });

  it("詳細（売買・実物）を正規化する", () => {
    expect(detail("detail-sale-1.html", "100140830944", "sale")).toMatchObject({
      dealType: "sale",
      title: "パークタワー勝どきサウス",
      price: 209_800_000,
      managementFee: 25_440,
      repairReserveFee: 8_630,
      layout: "3LDK",
      areaSqm: 73.1,
      builtYearMonth: "2023-08",
      floor: 16,
      totalFloors: 58,
      direction: "北西",
      transactionMode: "exclusive_agency",
    });
    expect(detail("detail-sale-2.html", "100141122398", "sale")).toMatchObject({
      price: 59_800_000,
      layout: "1LDK",
      areaSqm: 42.39,
      stations: [{ station: "勝どき" }, { station: "築地市場" }, { station: "月島" }],
    });
  });

  it("和暦の日付（令和）を解釈する", () => {
    expect(parseJpDate("令和 8年10月14日")).toBe("2026-10-13T15:00:00.000Z");
    expect(parseJpDate("2026年1月2日")).toBe("2026-01-01T15:00:00.000Z");
    expect(parseJpDate(undefined)).toBeNull();
  });

  it("期間の既定値: 9時前は前日、日中は当日（REINS_SEARCH_PERIOD で上書き）", () => {
    vi.stubEnv("REINS_SEARCH_PERIOD", "");
    expect(defaultPeriod(new Date("2026-10-13T22:30:00Z"))).toBe("yesterday"); // JST 7:30
    expect(defaultPeriod(new Date("2026-10-14T03:00:00Z"))).toBe("today"); // JST 12:00
    vi.stubEnv("REINS_SEARCH_PERIOD", "3d");
    expect(defaultPeriod(new Date("2026-10-14T03:00:00Z"))).toBe("3d");
    vi.unstubAllEnvs();
  });
});
