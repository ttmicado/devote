import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { crawlSource } from "../../runner.js";
import { fixtureFetcher } from "../../testing.js";
import {
  parseFeeLoose,
  parseLayoutLoose,
  parseMonthsLoose,
  parseYenWithSymbol,
  pickBuildingLine,
} from "./helpers.js";
import adapter, { listingIdFromUrl } from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.moriliving.com";

const detail = (id: string) => {
  const url = `${BASE}/ja/vacancy/${id.replace("-", "/")}.html`;
  return adapter.normalize(adapter.parseDetail(fixture(`detail-${id}.html`), url));
};

describe("mori-living parseList（内部JSON）", () => {
  it("賃貸JSONから部屋単位の ID・詳細URL・賃料を取る", () => {
    const r = adapter.parseList(fixture("list-lease.json"), `${BASE}/api/lease_ja.json`);
    expect(r.items).toHaveLength(31);
    expect(r.totalCount).toBe(31);
    expect(r.nextPageUrl).toBeNull();
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(31);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "0101-A610",
      detailUrl: `${BASE}/ja/vacancy/0101/A610.html`,
      price: 510_000,
    });
  });

  it("売買JSON（現在0件）も解釈できる", () => {
    const r = adapter.parseList(fixture("list-sale.json"), `${BASE}/api/sale_ja.json`);
    expect(r).toEqual({ items: [], nextPageUrl: null, totalCount: 0 });
  });

  it("JSONでない応答は throw する", () => {
    expect(() => adapter.parseList("<html></html>", `${BASE}/api/lease_ja.json`)).toThrow();
  });
});

describe("mori-living normalize", () => {
  it("詳細ページ＋建物ページを NormalizedListing に正規化する", () => {
    const n = detail("0101-A610");
    expect(NormalizedListing.parse(n)).toBeTruthy();
    expect(n).toMatchSnapshot();
  });

  it("複数棟の建物概要から対象棟（レジデンスA）の構造・階数を選ぶ", () => {
    const n = detail("0101-A610");
    expect(n).toMatchObject({
      layout: "1LDK",
      floor: 6,
      totalFloors: 6,
      structure: "RC",
      builtYearMonth: "2003-04",
      deposit: 2_040_000, // 原則賃料の4ヶ月分
      keyMoney: 0,
      managementFee: 0, // 賃料込み
      transactionMode: "owner",
    });
    expect(n.imageUrls?.[0]).toBe(`${BASE}/assets/images/layout/000601_01_RHA_610.svg`);
    expect(n.imageUrls).toContain(
      `${BASE}/assets/images/common/residence/roppongihills/image01l.webp`,
    );
  });

  it("3BR・S造（柱CFT）・室内写真（data-srcset の遅延読み込み）", () => {
    const n = detail("0301-4003");
    expect(n).toMatchObject({ layout: "3LDK", areaSqm: 238.48, structure: "S", totalFloors: 42 });
    expect(n.extra).toMatchObject({ 間取り: "3BR" }); // 一覧JSONでは "3BR+F"

    const n2 = detail("0253-2605");
    expect(n2).toMatchObject({ layout: "2LDK", builtYearMonth: "2025-10", totalFloors: 64 });
    expect(n2.imageUrls).toContain(`${BASE}/assets/43_AHB_100-D2_Light_02.jpg`);
    expect(n2.imageUrls?.some((u) => u.includes("${") || u.includes("search_result"))).toBe(false);
  });

  it("賃料が数値でない部屋は throw する", () => {
    const raw = adapter.parseDetail(
      fixture("detail-0101-A610.html"),
      `${BASE}/ja/vacancy/0101/A610.html`,
    );
    expect(() =>
      adapter.normalize({ ...raw, fields: { ...raw.fields, 価格: "お問い合わせ" } }),
    ).toThrow();
  });

  it("売買物件は価格・管理費・修繕積立金として扱う", () => {
    const raw = adapter.parseDetail(
      fixture("detail-0101-A610.html"),
      `${BASE}/ja/vacancy/0101/A610.html`,
    );
    const n = adapter.normalize({
      ...raw,
      fields: {
        ...raw.fields,
        種別: "分譲物件",
        価格: "¥298,000,000",
        "管理・共益費": undefined as unknown as string,
        管理費: "¥45,000",
        修繕積立金: "¥12,300",
      },
    });
    expect(n).toMatchObject({
      dealType: "sale",
      price: 298_000_000,
      managementFee: 45_000,
      repairReserveFee: 12_300,
      deposit: null,
      keyMoney: null,
    });
  });
});

describe("crawlSource（フィクスチャ）", () => {
  it("一覧JSON → 詳細 → 正規化まで通る", async () => {
    const ctx = fixtureFetcher(dir, {
      [`${BASE}/api/lease_ja.json`]: "list-lease.json",
      [`${BASE}/api/sale_ja.json`]: "list-sale.json",
      [`${BASE}/ja/vacancy/0101/A610.html`]: "detail-0101-A610.html",
    });
    const known = new Map(
      adapter
        .parseList(fixture("list-lease.json"), `${BASE}/api/lease_ja.json`)
        .items.filter((i) => i.sourceListingId !== "0101-A610")
        .map((i) => [i.sourceListingId, i.listHash]),
    );
    const r = await crawlSource(adapter, ctx, { knownListHashes: known });
    expect(r.listings.map((l) => l.sourceListingId)).toEqual(["0101-A610"]);
    expect(r).toMatchObject({ errors: [], listCompleted: true, countMismatch: false });
    expect(r.seenIds).toHaveLength(31);
  });
});

describe("表記揺れ", () => {
  it.each([
    ["1BR", "1LDK"],
    ["2BR", "2LDK"],
    ["3BR+F", "3LDK"],
    ["2BR+S", "2SLDK"],
    ["STUDIO", "1R"],
    ["1R", "1R"],
    ["２ＬＤＫ", "2LDK"],
  ])("間取り %s → %s", (input, expected) => {
    expect(parseLayoutLoose(input)).toBe(expected);
  });

  it("金額・敷金・管理費の自由記述", () => {
    expect(parseYenWithSymbol("¥510,000")).toBe(510_000);
    expect(parseYenWithSymbol("￥1,230,000")).toBe(1_230_000);
    expect(parseYenWithSymbol("お問い合わせ")).toBeNull();
    expect(parseMonthsLoose("原則賃料の4ヶ月分", 500_000)).toBe(2_000_000);
    expect(parseMonthsLoose("なし", 500_000)).toBe(0);
    expect(parseMonthsLoose("1,000,000円", 500_000)).toBe(1_000_000);
    expect(parseFeeLoose("賃料込み")).toBe(0);
    expect(parseFeeLoose("¥30,000")).toBe(30_000);
  });

  it("複数棟併記の行選択", () => {
    const text = "レジデンスA／RC造\nレジデンスB／SRC造（CFT柱）\nレジデンスC／SRC造";
    expect(pickBuildingLine(text, "六本木ヒルズレジデンスＢ")).toBe("SRC造（CFT柱）");
    expect(pickBuildingLine(text, "別の建物")).toBeNull();
    expect(pickBuildingLine("地上42階・地下5階", "愛宕")).toBe("地上42階・地下5階");
    expect(listingIdFromUrl("/ja/vacancy/0903/S203.html")).toBe("0903-S203");
  });
});
