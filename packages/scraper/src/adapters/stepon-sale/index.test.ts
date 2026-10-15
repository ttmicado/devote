import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.stepon.co.jp";
const detail = (file: string, path: string) =>
  NormalizedListing.parse(adapter.normalize(adapter.parseDetail(fixture(file), `${BASE}${path}`)));

describe("stepon-sale queries", () => {
  it("中古マンション・一戸建て × 区の一覧URLを作る（中央区・江東区は町名で絞る）", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(12);
    expect(urls[0]).toBe(`${BASE}/mansion/area_13/list_13_103/`);
    expect(urls).toContain(`${BASE}/kodate/area_13/list_13_113/`);
    expect(urls).toContain(
      `${BASE}/mansion/area_13/list_13_102/#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E6%99%B4%E6%B5%B7`,
    );
  });
});

describe("stepon-sale parseList", () => {
  it("物件番号・詳細URL・価格（億・万円）・総件数・次ページを取る", () => {
    const r = adapter.parseList(
      fixture("list-mansion-minato-1.html"),
      `${BASE}/mansion/area_13/list_13_103/`,
    );
    expect(r.items).toHaveLength(30);
    expect(r.items[1]).toMatchObject({
      sourceListingId: "158P3027",
      detailUrl: `${BASE}/mansion/detail_158P3027/`,
      price: 309_000_000,
    });
    expect(r.totalCount).toBe(186);
    expect(r.nextPageUrl).toBe(`${BASE}/mansion/area_13/list_13_103/30_2/`);
  });

  it("最終ページ（7ページ目）で止まる", () => {
    const r = adapter.parseList(
      fixture("list-mansion-minato-7.html"),
      `${BASE}/mansion/area_13/list_13_103/30_7/`,
    );
    expect(r.items).toHaveLength(6);
    expect(r.nextPageUrl).toBeNull();
  });

  it("0件の一覧は空（千代田区の一戸建て）", () => {
    const r = adapter.parseList(
      fixture("list-kodate-chiyoda-empty.html"),
      `${BASE}/kodate/area_13/list_13_101/`,
    );
    expect(r).toMatchObject({ items: [], nextPageUrl: null, totalCount: 0 });
  });

  it("町名で絞る一覧は勝どき・晴海だけ残し、次ページにも絞り込みを引き継ぐ", () => {
    const url = `${BASE}/mansion/area_13/list_13_102/#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E6%99%B4%E6%B5%B7`;
    const r = adapter.parseList(fixture("list-mansion-chuo-1.html"), url);
    // 1ページ目30件のうち 晴海10件・勝どき2件（湊・月島・銀座などは除く）
    expect(r.items).toHaveLength(12);
    expect(r.totalCount).toBeNull();
    expect(r.nextPageUrl).toBe(
      `${BASE}/mansion/area_13/list_13_102/30_2/#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E6%99%B4%E6%B5%B7`,
    );
  });

  it("一覧の「25億」「8,000万円」も円の整数にする", () => {
    const $ = cheerio.load(fixture("list-mansion-minato-1.html"));
    $("#label_price_head").first().text("25");
    const r = adapter.parseList($.html(), `${BASE}/mansion/area_13/list_13_103/`);
    expect(r.items[0]?.price).toBe(2_580_000_000);
  });

  it("物件番号/リンクが取れない行は throw せず skipped に入れ、残りの行は読む", () => {
    const $ = cheerio.load(fixture("list-mansion-minato-7.html"));
    $(".sr-card a.sr-card__name").first().removeAttr("href");
    const r = adapter.parseList($.html(), `${BASE}/mansion/area_13/list_13_103/30_7/`);
    expect(r.items).toHaveLength(5);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped?.[0]).toMatch(/物件番号\/リンクが取れない/);
  });
});

describe("stepon-sale normalize", () => {
  it("中古マンションを NormalizedListing に正規化する", () => {
    expect(detail("detail-mansion-158P3027.html", "/mansion/detail_158P3027/")).toMatchSnapshot();
  });

  it("「3億900万円」「18階部分／地上45階地下1階建て」、管理費・修繕積立金を吸収する", () => {
    expect(detail("detail-mansion-158P3027.html", "/mansion/detail_158P3027/")).toMatchObject({
      dealType: "sale",
      propertyType: "mansion",
      title: "白金ザ・スカイ",
      price: 309_000_000,
      managementFee: 29_300,
      repairReserveFee: 9_783,
      layout: "3LDK",
      areaSqm: 75.83,
      floor: 18,
      totalFloors: 45,
      structure: "SRC",
      builtYearMonth: "2023-02",
      transactionMode: "brokerage",
      stations: [
        { line: "都営三田線", station: "白金高輪", walkMinutes: 3, busMinutes: null },
        { line: "東京メトロ南北線", station: "白金高輪", walkMinutes: 3, busMinutes: null },
        { line: "都営大江戸線", station: "麻布十番", walkMinutes: 12, busMinutes: null },
      ],
    });
  });

  it("一戸建ては建物面積・所在階なし・土地面積は extra に残す", () => {
    const n = detail("detail-kodate-168P2002.html", "/kodate/detail_168P2002/");
    expect(n).toMatchObject({
      propertyType: "house",
      price: 970_000_000,
      areaSqm: 227.58,
      floor: null,
      totalFloors: 2,
      structure: "RC",
      managementFee: null,
      repairReserveFee: null,
    });
    expect(n.extra.土地面積).toMatch(/^149\.51m2/);
  });

  it("写真はこの物件の拡大画像だけ", () => {
    const n = detail("detail-mansion-158P3027.html", "/mansion/detail_158P3027/");
    expect(n.imageUrls.length).toBeGreaterThan(10);
    expect(n.imageUrls.every((u) => u.includes("/158P3027/158P3027_") && /_l\.\w+$/.test(u))).toBe(
      true,
    );
  });

  it("25億円超の価格も円の整数で取る", () => {
    const raw = adapter.parseDetail(
      fixture("detail-mansion-158P3027.html"),
      `${BASE}/mansion/detail_158P3027/`,
    );
    for (const [text, yen] of [
      ["25億円", 2_500_000_000],
      ["25億8,000万円", 2_580_000_000],
      ["３０億円", 3_000_000_000],
    ] as const) {
      expect(adapter.normalize({ ...raw, fields: { ...raw.fields, 価格: text } }).price).toBe(yen);
    }
  });
});
