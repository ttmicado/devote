import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isInTargetArea, NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter, { isResidentialLike } from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.axel-home.com";
const KACHIDOKI = `${BASE}/areas/result?usage=residence&city_ids%5B0%5D=175`;
const AKASAKA_BIZ = `${BASE}/areas/result?usage=business&city_ids%5B0%5D=80`;
const detail = (property: string, room: string, usage = "residence") =>
  NormalizedListing.parse(
    adapter.normalize(
      adapter.parseDetail(
        fixture(`detail-${room}.html`),
        `${BASE}/property/${property}/outline/${room}?usage=${usage}`,
      ),
    ),
  );

describe("axel-home queries", () => {
  it("区ページと町名（勝どき・豊洲）の一覧URLを、事業用→住居の順で作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toEqual([
      `${BASE}/areas/minato?usage=business`,
      `${BASE}/areas/shibuya?usage=business`,
      `${BASE}/areas/chiyoda?usage=business`,
      `${BASE}/areas/shinagawa?usage=business`,
      `${BASE}/areas/result?usage=business&city_ids%5B0%5D=175`,
      `${BASE}/areas/result?usage=business&city_ids%5B0%5D=2`,
      `${BASE}/areas/minato?usage=residence`,
      `${BASE}/areas/shibuya?usage=residence`,
      `${BASE}/areas/chiyoda?usage=residence`,
      `${BASE}/areas/shinagawa?usage=residence`,
      KACHIDOKI,
      `${BASE}/areas/result?usage=residence&city_ids%5B0%5D=2`,
    ]);
    // 住居のクエリが後（ランナーは同じ部屋IDを後のクエリの詳細URLで上書きする）
    const keys = adapter.queries().map((q) => q.key);
    expect(keys.indexOf("minato")).toBeGreaterThan(keys.indexOf("business-koto-toyosu"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("axel-home parseList", () => {
  it("建物ごとの空室カードから部屋ID・詳細URL・賃料・次ページを取る", () => {
    const r = adapter.parseList(fixture("list-kachidoki-1.html"), KACHIDOKI);
    expect(r.items).toHaveLength(47);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "r44026",
      detailUrl: `${BASE}/property/1365/outline/r44026?usage=residence`,
      price: 235_000,
    });
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(47);
    expect(r.nextPageUrl).toBe(`${KACHIDOKI}&page=2`);
    // 「計N件」は空室0を含む建物数なので使わない
    expect(r.totalCount).toBeNull();
  });

  it("空室0の建物が並ぶページで巡回を打ち切る", () => {
    const r = adapter.parseList(fixture("list-kachidoki-11.html"), `${KACHIDOKI}&page=11`);
    expect(r.items).toHaveLength(0);
    expect(r.nextPageUrl).toBeNull();
  });
});

describe("axel-home normalize", () => {
  it("部屋詳細を NormalizedListing に正規化する", () => {
    expect(detail("1365", "r44026")).toMatchSnapshot();
  });

  it("写真（間取り図・外観・室内）を絶対URLで全件拾う", () => {
    const n = detail("1365", "r44026");
    expect(n.imageUrls).toHaveLength(27);
    expect(n.imageUrls[0]).toMatch(/^https:\/\/www\.axel-home\.com\/image-proxy\?path=/);
  });

  it("「1ヶ月/1.75ヶ月」「0円」「鉄骨鉄筋コンクリート(SRC) 地上14階建て」、見出しの所在階", () => {
    const n = detail("11805", "r221105");
    expect(n).toMatchObject({
      price: 294_000,
      managementFee: 0,
      deposit: 294_000,
      keyMoney: 514_500,
      layout: "3LDK",
      areaSqm: 68.23,
      floor: 17,
      totalFloors: 26,
      transactionMode: "brokerage",
    });
    const n2 = detail("14249", "r191199");
    expect(n2).toMatchObject({ structure: "SRC", totalFloors: 14, floor: 2, deposit: 0 });
    expect(n2.features).toContain("free_rent"); // 備考「フリーレント1ヶ月」
    expect(isInTargetArea(n2.address.raw)).toBe(true);
  });

  it("全角の賃料・敷礼表記を吸収し、賃料がなければ throw する", () => {
    const raw = adapter.parseDetail(
      fixture("detail-r44026.html"),
      `${BASE}/property/1365/outline/r44026?usage=residence`,
    );
    const n = adapter.normalize({
      ...raw,
      fields: { ...raw.fields, 賃料: "２３．５万円", "敷金/礼金": "なし／1ヶ月", 管理費: "-" },
    });
    expect(n).toMatchObject({ price: 235_000, deposit: 0, keyMoney: 235_000, managementFee: 0 });
    expect(() => adapter.normalize({ ...raw, fields: { ...raw.fields, 賃料: "" } })).toThrow(
      /賃料/,
    );
  });
});

describe("axel-home 事業用（事務所・店舗）", () => {
  it("事業用の一覧から SOHO 可の住居（住居の一覧と重複する部屋）を除外する", () => {
    const r = adapter.parseList(fixture("list-akasaka-business-1.html"), AKASAKA_BIZ);
    // カードは15件。うち「SOHO」タグの建物（アークヒルズエグゼクティブタワーRoP 等）の6件を除外
    expect(r.items.map((i) => i.sourceListingId)).toEqual([
      "r180329",
      "r210956",
      "r178692",
      "r178499",
      "r183285",
      "r144012",
      "r212772",
      "r212771",
      "r183371",
    ]);
    for (const id of ["r167770", "r220365", "r83133", "r128955"]) {
      expect(r.items.some((i) => i.sourceListingId === id)).toBe(false);
    }
    expect(r.items[0]).toMatchObject({
      detailUrl: `${BASE}/property/15038/outline/r180329?usage=business`,
      price: 412_500,
    });
    expect(r.nextPageUrl).toBe(`${AKASAKA_BIZ}&page=2`);
    expect(r.totalCount).toBeNull();
  });

  it("事務所を usage=business・間取りなしで正規化する", () => {
    const n = detail("15038", "r180329", "business");
    expect(n).toMatchSnapshot();
    expect(n).toMatchObject({
      usage: "business",
      dealType: "rent",
      layout: null,
      propertyType: "other",
      price: 412_500,
      managementFee: 82_500,
      deposit: 2_475_000, // 敷金6ヶ月
      keyMoney: 0,
      areaSqm: 82.64,
      floor: 3,
      totalFloors: 4,
    });
    expect(n.extra).toMatchObject({ 用途: "事務所", 間取り表記: "1R", 条件: "事務所" });
    expect(isInTargetArea(n.address.raw)).toBe(true);
  });

  it("店舗の「保証金/礼金 400万円/0ヶ月」「ワンフロア」", () => {
    const n = detail("15143", "r183371", "business");
    expect(n).toMatchObject({
      usage: "business",
      layout: null,
      price: 345_000,
      managementFee: 39_204,
      deposit: 4_000_000,
      keyMoney: 0,
      areaSqm: 47.16,
      floor: null,
    });
    expect(n.extra).toMatchObject({
      用途: "店舗",
      間取り表記: "ワンフロア",
      "保証金/礼金": "400万円/0ヶ月",
      備考: "飲食相談可",
    });
  });

  it("SOHO 可の住居は事業用のURLで来ても事業用にしない（throw）。住居のURLなら住居", () => {
    expect(() => detail("8393", "r167770", "business")).toThrow(/SOHO/);
    const n = detail("8393", "r167770");
    expect(n).toMatchObject({ usage: "residential", layout: "1R", propertyType: "mansion" });
  });

  it("住居の一覧・詳細は usage=residential のまま", () => {
    for (const [p, room] of [
      ["1365", "r44026"],
      ["11805", "r221105"],
      ["14249", "r191199"],
    ] as const) {
      const n = detail(p, room);
      expect(n.usage).toBe("residential");
      expect(n.layout).not.toBeNull();
      expect(n.extra.用途).toBeUndefined();
    }
    const r = adapter.parseList(fixture("list-kachidoki-1.html"), KACHIDOKI);
    expect(r.items.every((i) => i.detailUrl.includes("usage=residence"))).toBe(true);
  });

  it.each([
    [["事務所"], "1R", false],
    [["事務所", "店舗"], "ワンフロア", false],
    [["店舗"], undefined, false],
    [["SOHO", "事務所"], "1R", true],
    [["事務所"], "1K", true],
    [["事務所", "店舗"], "2LDK", true],
  ])("isResidentialLike(%j, %s) → %s", (tags, layout, expected) => {
    expect(isResidentialLike(tags, layout)).toBe(expected);
  });
});
