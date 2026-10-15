import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import adapter, { MAX_PAGES, parseSearchUrl, VERIFIED } from "./index.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");
const LOGIN = "https://itandi-accounts.com/login?client_id=itandi_bb";

describe("itandi-bb（2026-10-14 実画面で確認）", () => {
  it("検証済みフラグと会員サイト用の meta", () => {
    expect(VERIFIED).toBe(true);
    expect(adapter.meta).toMatchObject({
      requiresLogin: true,
      parserVersion: "1",
      incrementalList: true,
    });
    expect(adapter.meta.fetchMode).toEqual({ list: "browser", detail: "browser" });
    expect(adapter.meta.rateLimit.minIntervalMs).toBeGreaterThanOrEqual(3000);
    expect(adapter.meta.rateLimit.maxConcurrency).toBe(1);
  });

  it("実物のログイン画面（2026-10-13 取得）をログアウト状態と判定する", () => {
    const html = fixture("login.html");
    expect(adapter.isLoggedOut?.(html, LOGIN)).toBe(true);
    // itandibb.com 側の URL のままログイン画面の HTML が返った場合も拾う
    expect(adapter.isLoggedOut?.(html, "https://itandibb.com/rent_rooms/list")).toBe(true);
  });

  it("API の JSON はログアウト扱いしない", () => {
    expect(adapter.isLoggedOut?.('{"buildings":[]}', "https://itandibb.com/rent_rooms/list")).toBe(
      false,
    );
  });

  it("賃貸 × 対象エリアのクエリ", () => {
    const qs = adapter.queries();
    expect(qs).toHaveLength(7);
    expect(qs.every((q) => q.params.deal === "rent")).toBe(true);
    const kachidoki = qs.find((q) => q.params.town === "勝どき");
    expect(kachidoki && parseSearchUrl(adapter.buildListUrl(kachidoki))).toMatchObject({
      city: "中央区",
      town: "勝どき",
      page: 1,
    });
  });

  describe("login", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("認証情報が未設定なら分かりやすいエラーで止まる", async () => {
      vi.stubEnv("ITANDI_EMAIL", "");
      vi.stubEnv("ITANDI_PASSWORD", "");
      await expect(
        adapter.login?.({ get: async () => ({ status: 0, body: "", url: "" }) }),
      ).rejects.toThrow(/ITANDI_EMAIL/);
    });
  });

  it("希望条件の範囲（scopes）にある賃貸のエリアだけを検索する", () => {
    const scope = (dealType: "rent" | "sale", city: string) => ({
      dealType,
      prefecture: "東京都",
      city,
      town: null,
      maxPrice: null,
      minAreaSqm: null,
      minRooms: null,
    });
    expect(adapter.queries({ scopes: [] })).toEqual([]);
    const qs = adapter.queries({ scopes: [scope("rent", "港区"), scope("sale", "渋谷区")] });
    expect(qs.map((q) => q.params.city)).toEqual(["港区"]);
    expect(adapter.meta.scopedByConditions).toBe(true);
  });

  const url = "itandi-bb://search?deal=rent&pref=東京都&city=港区";

  it("一覧 JSON（実物・マスク済み。1ページ20棟、更新が新しい順）", () => {
    const r = adapter.parseList(fixture("list-minato.json"), url);
    expect(r.items).toHaveLength(43);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "35619807",
      price: 155_000,
      detailUrl: "https://itandibb.com/rent_rooms/35619807",
    });
    expect(r.totalCount).toBe(1939);
    expect(r.nextPageUrl && parseSearchUrl(r.nextPageUrl)).toMatchObject({ city: "港区", page: 2 });
    expect(() => adapter.parseList("<html></html>", url)).toThrow(/JSON/);
  });

  it("一覧: 更新が1日以内の部屋がないページ・上限ページでは次へ進まない", () => {
    const json = JSON.parse(fixture("list-minato.json")) as {
      buildings: { rooms: { offer_conditions_update_elapsed: string }[] }[];
    };
    for (const b of json.buildings)
      for (const r of b.rooms) r.offer_conditions_update_elapsed = "3日前";
    expect(adapter.parseList(JSON.stringify(json), url).nextPageUrl).toBeNull();
    expect(
      adapter.parseList(fixture("list-minato.json"), `${url}&page=${MAX_PAGES}`).nextPageUrl,
    ).toBeNull();
  });

  it("詳細 JSON（実物・マスク済み）を正規化する", () => {
    const raw = adapter.parseDetail(
      fixture("detail-1.json"),
      "https://itandibb.com/rent_rooms/35619807",
    );
    expect(adapter.normalize(raw)).toMatchObject({
      sourceListingId: "35619807",
      title: "パークアクシス芝浦キャナル",
      address: { prefecture: "東京都", city: "港区", town: "海岸" },
      price: 155_000,
      managementFee: 10_000,
      deposit: 155_000,
      keyMoney: 0,
      layout: "1DK",
      areaSqm: 25.55,
      builtYearMonth: "2022-01",
      floor: 7,
      totalFloors: 10,
      structure: "RC",
      direction: "東",
      transactionMode: "owner",
      adAllowed: null,
    });
    expect(raw.imageUrls.length).toBeGreaterThan(0);
    expect(raw.imageUrls.every((u) => u.startsWith("https://property-images.itandi.co.jp/"))).toBe(
      true,
    );
    const raw2 = adapter.parseDetail(fixture("detail-2.json"), "https://itandibb.com/rent_rooms/x");
    expect(adapter.normalize(raw2).price).toBeGreaterThan(0);
  });
});
