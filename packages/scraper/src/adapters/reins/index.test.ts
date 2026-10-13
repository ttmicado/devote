import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import adapter, { buildSearchUrl, LOGIN_URL, parseSearchUrl, VERIFIED } from "./index.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");

describe("reins（未検証のたたき台）", () => {
  it("未検証フラグと会員サイト用の meta", () => {
    expect(VERIFIED).toBe(false);
    expect(adapter.meta).toMatchObject({
      fetchMode: { list: "browser", detail: "browser" },
      requiresLogin: true,
      parserVersion: "0-unverified",
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
    expect(urls).toContain(
      buildSearchUrl({ deal: "rent", prefecture: "東京都", city: "港区", town: null }),
    );
    expect(
      parseSearchUrl(adapter.buildListUrl(qs.find((q) => q.params.town === "勝どき") ?? qs[0]!)),
    ).toEqual({
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

  it("一覧: 0件の画面は空配列、想定外の構造は throw", () => {
    const url = "reins://search?deal=rent&city=港区";
    expect(adapter.parseList("<body>該当する物件はありません</body>", url).items).toEqual([]);
    expect(() => adapter.parseList("<body>なにか別の画面</body>", url)).toThrow(/構造が想定と違う/);
  });

  it("normalize: 項目名→値の対応（合成データ。実画面の項目名は未確認）", () => {
    const n = adapter.normalize({
      sourceListingId: "100123456789",
      url: "reins://detail?id=100123456789&deal=rent",
      imageUrls: [],
      fields: {
        __deal: "rent",
        物件番号: "100123456789",
        物件種目: "賃貸マンション",
        賃料: "25.5万円",
        管理費: "10,000円",
        敷金: "1ヶ月",
        礼金: "なし",
        都道府県名: "東京都",
        所在地名１: "港区",
        所在地名２: "南青山３丁目",
        沿線名1: "東京メトロ銀座線",
        駅名1: "表参道",
        駅より徒歩1: "5分",
        間取タイプ: "LDK",
        間取部屋数: "1",
        専有面積: "45.20㎡",
        築年月: "2015年3月",
        所在階: "5",
        地上階層: "10",
        取引態様: "専任媒介",
        広告転載区分: "広告可",
        変更年月日: "2026/10/10",
      },
    });
    expect(n).toMatchObject({
      dealType: "rent",
      price: 255_000,
      managementFee: 10_000,
      deposit: 255_000,
      keyMoney: 0,
      address: { prefecture: "東京都", city: "港区", town: "南青山" },
      stations: [{ station: "表参道", walkMinutes: 5 }],
      layout: "1LDK",
      areaSqm: 45.2,
      builtYearMonth: "2015-03",
      floor: 5,
      totalFloors: 10,
      transactionMode: "exclusive_agency",
      adAllowed: true,
    });
  });
});
