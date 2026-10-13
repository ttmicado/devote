import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isInTargetArea, NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { parseTotalFloors, withPrefecture } from "./helpers.js";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.kencorp.co.jp";
const API = `${BASE}/_api/search/result/`;
const detailUrl = (bldg: string, code: string) => `${BASE}/housing/properties/${bldg}/${code}/`;
const detail = (bldg: string, code: string) =>
  NormalizedListing.parse(
    adapter.normalize(adapter.parseDetail(fixture(`detail-${code}.html`), detailUrl(bldg, code))),
  );

describe("kencorp queries", () => {
  it("賃貸・売買 × 区/エリアの検索API URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(12);
    expect(urls).toContain(
      `${API}?search_type=rent&search_by=district&districts=12&page=1&per_page=50`,
    );
    expect(urls).toContain(
      `${API}?search_type=buy&search_by=area&areas=ginwan02&page=1&per_page=50`,
    );
  });
});

describe("kencorp parseList（内部JSON API）", () => {
  const url1 = `${API}?search_type=rent&search_by=area&areas=ginwan02&page=1&per_page=10`;

  it("建物 → 部屋を平らにし、次ページ・総件数を返す", () => {
    const r = adapter.parseList(fixture("list-rent-toyosu-1.json"), url1);
    expect(r.items).toHaveLength(29);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "2017050408",
      detailUrl: detailUrl("184902", "2017050408"),
      price: 410_000,
    });
    expect(r.nextPageUrl).toBe(
      `${API}?search_type=rent&search_by=area&areas=ginwan02&page=2&per_page=10`,
    );
    expect(r.totalCount).toBe(40);
  });

  it("最終ページでは nextPageUrl が null。2ページ合計が総件数と一致する", () => {
    const r1 = adapter.parseList(fixture("list-rent-toyosu-1.json"), url1);
    const r2 = adapter.parseList(
      fixture("list-rent-toyosu-2.json"),
      url1.replace("page=1", "page=2"),
    );
    expect(r2.nextPageUrl).toBeNull();
    expect(r1.items.length + r2.items.length).toBe(r2.totalCount);
  });

  it("売買の価格（万円）を円に直す", () => {
    const r = adapter.parseList(
      fixture("list-sale-toyosu-1.json"),
      `${API}?search_type=buy&search_by=area&areas=ginwan02&page=1&per_page=50`,
    );
    expect(r.items).toHaveLength(10);
    expect(r.items.find((i) => i.sourceListingId === "2026095145")?.price).toBe(205_000_000);
    expect(r.nextPageUrl).toBeNull();
  });

  it("JSON でない応答は throw する", () => {
    expect(() => adapter.parseList("<html></html>", url1)).toThrow(/JSON/);
  });
});

describe("kencorp normalize", () => {
  it("賃貸の詳細を正規化する", () => {
    expect(detail("158244", "2008051357")).toMatchSnapshot();
  });

  it("売買（マンション）の詳細を正規化する", () => {
    expect(detail("183198", "2026095145")).toMatchSnapshot();
  });

  it("売買: 「2億500万円」「月額30,020円」「地上32階 地下1階建 / 22階部分」を吸収する", () => {
    const n = detail("183198", "2026095145");
    expect(n).toMatchObject({
      dealType: "sale",
      price: 205_000_000,
      managementFee: 30_020,
      repairReserveFee: 25_890,
      floor: 22,
      totalFloors: 32,
      structure: "RC",
      propertyType: "mansion",
      transactionMode: "brokerage",
      deposit: null,
      keyMoney: null,
    });
    expect(n.imageUrls).toHaveLength(29);
    expect(n.imageUrls).toContain(`${BASE}/images/building/183198/183198_q1.jpg`); // 外観
    expect(n.imageUrls).toContain(`${BASE}/images/property/20260951/2026095145/2026095145_z1.gif`); // 間取り図
  });

  it("売買: 一戸建ては延床面積・propertyType=house、見出しから間取りを除いて建物名にする", () => {
    const n = detail("215388", "2026055097");
    expect(n).toMatchObject({
      dealType: "sale",
      title: "渋谷区恵比寿3丁目一戸建",
      price: 188_000_000,
      areaSqm: 83.46,
      layout: "2SLDK",
      propertyType: "house",
      structure: "W",
      totalFloors: 3,
      floor: null,
      managementFee: null,
    });
  });

  it("賃貸: 「256,000円 / 20,000円」「1ヶ月 / 無」、都道府県のない住所を補う", () => {
    const n = detail("216638", "2026090248");
    expect(n).toMatchObject({
      dealType: "rent",
      title: "テラス神田猿楽町",
      price: 256_000,
      managementFee: 20_000,
      deposit: 256_000,
      keyMoney: 0,
      layout: "2LDK",
      direction: "南西",
      floor: 3,
      totalFloors: 13,
      builtYearMonth: "2026-09",
      address: { prefecture: "東京都", city: "千代田区", town: "神田猿楽町" },
    });
    expect(n.features).toEqual(expect.arrayContaining(["pet_ok", "corner_room", "south_facing"]));
    expect(isInTargetArea(n.address.raw)).toBe(true);
  });

  it("価格も賃料もない詳細は throw する", () => {
    expect(() =>
      adapter.parseDetail("<div class='main co-ho-pr'></div>", detailUrl("1", "2")),
    ).toThrow();
  });
});

describe("kencorp helpers", () => {
  it("withPrefecture", () => {
    expect(withPrefecture("千代田区神田猿楽町２")).toBe("東京都千代田区神田猿楽町2");
    expect(withPrefecture("横浜市中区山手町")).toBe("神奈川県横浜市中区山手町");
    expect(withPrefecture("東京都港区赤坂")).toBe("東京都港区赤坂");
  });
  it("parseTotalFloors", () => {
    expect(parseTotalFloors("地上32階 地下1階建")).toBe(32);
    expect(parseTotalFloors("地上13階建")).toBe(13);
  });
});
