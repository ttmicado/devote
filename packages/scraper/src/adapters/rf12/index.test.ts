import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isInTargetArea, NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { parseJpDate, parseStructure, parseTotalFloors } from "./helpers.js";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://rf12.jp";
const detail = (file: string, path: string) =>
  NormalizedListing.parse(adapter.normalize(adapter.parseDetail(fixture(file), `${BASE}${path}`)));

describe("rf12 queries", () => {
  it("対象エリア（区・町名コード）ごとの一覧URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toContain(`${BASE}/list/?city%5B%5D=1`);
    expect(urls).toContain(`${BASE}/list/?town%5B%5D=131020003`);
    expect(urls).toContain(`${BASE}/list/?town%5B%5D=131080032`);
    expect(urls).toHaveLength(6);
  });
});

describe("rf12 parseList", () => {
  it("建物ごとの空室行から部屋ID・詳細URL・賃料・次ページ・総部屋数を取る", () => {
    const r = adapter.parseList(fixture("list-chiyoda-1.html"), `${BASE}/list/?city%5B%5D=9`);
    expect(r.items).toHaveLength(147);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "231246",
      detailUrl: `${BASE}/building/1749/231246/`,
      price: 134_000,
    });
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(147);
    expect(r.nextPageUrl).toBe(`${BASE}/list/?city%5B0%5D=9&per_page=2`);
    expect(r.totalCount).toBe(381);
  });

  it("空室0の建物しかないページでは次ページへ進まない", () => {
    const r = adapter.parseList(
      fixture("list-chiyoda-6.html"),
      `${BASE}/list/?city%5B0%5D=9&per_page=6`,
    );
    expect(r.items).toHaveLength(0);
    expect(r.nextPageUrl).toBeNull();
  });

  it("listHash は条件が同じなら安定している", () => {
    const html = fixture("list-chiyoda-1.html");
    const a = adapter.parseList(html, `${BASE}/list/?city%5B%5D=9`);
    const b = adapter.parseList(html, `${BASE}/list/?city%5B%5D=9`);
    expect(a.items.map((i) => i.listHash)).toEqual(b.items.map((i) => i.listHash));
  });
});

describe("rf12 normalize", () => {
  it("部屋詳細を NormalizedListing に正規化する", () => {
    expect(detail("detail-222736.html", "/building/4462/222736/")).toMatchSnapshot();
  });

  it("全写真カテゴリ（外観・共用部・室内）と間取り図を絶対URLで拾う", () => {
    const n = detail("detail-60787.html", "/building/1256/60787/");
    expect(n.imageUrls).toHaveLength(87);
    expect(n.imageUrls[0]).toBe(`${BASE}/images/estate/1256/1/1256-1.jpg`);
    expect(n.imageUrls).toContain(`${BASE}/images/estate/1256/2/1256-1.jpg`); // 共用部
    expect(n.imageUrls.at(-1)).toBe(`${BASE}/images/room/60787/60787-1.png`); // 間取り図
    expect(n.imageUrls.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("「0ヶ月 / 0ヶ月」「地上15階 地下1階 SRC造」「m<sup>2</sup>」を吸収する", () => {
    const n = detail("detail-60787.html", "/building/1256/60787/");
    expect(n).toMatchObject({
      price: 203_000,
      managementFee: 12_000,
      deposit: 0,
      keyMoney: 0,
      layout: "1K",
      areaSqm: 27.19,
      floor: 6,
      totalFloors: 15,
      structure: "SRC",
      direction: "南西",
      builtYearMonth: "2001-05",
      transactionMode: "brokerage",
    });
    expect(n.features).toContain("south_facing");
    expect(isInTargetArea(n.address.raw)).toBe(true);
  });

  it("交通の「路線「駅名」徒歩N分」を分解する", () => {
    const n = detail("detail-231246.html", "/building/1749/231246/");
    expect(n.stations[0]).toEqual({
      line: "東京メトロ銀座線",
      station: "神田",
      walkMinutes: 2,
      busMinutes: null,
    });
    expect(n.address).toMatchObject({ city: "千代田区", town: "神田須田町" });
  });

  it("賃料が取れなければ throw する", () => {
    const raw = adapter.parseDetail(fixture("detail-222736.html"), `${BASE}/building/4462/222736/`);
    expect(() => adapter.normalize({ ...raw, fields: { ...raw.fields, 賃料: "応相談" } })).toThrow(
      /賃料/,
    );
  });

  it("全角数字・ペット相談・フリーレントの表記揺れ", () => {
    const raw = adapter.parseDetail(fixture("detail-222736.html"), `${BASE}/building/4462/222736/`);
    const n = adapter.normalize({
      ...raw,
      fields: {
        ...raw.fields,
        賃料: "１５．６万円",
        "敷金/礼金": "1.0ヶ月／1.0ヶ月",
        "所在階/向き": "地下1階/-",
        ペット飼育: "相談",
        フリーレント: "1ヶ月",
      },
    });
    expect(n).toMatchObject({
      price: 156_000,
      deposit: 156_000,
      keyMoney: 156_000,
      floor: -1,
      direction: null,
    });
    expect(n.features).toEqual(expect.arrayContaining(["pet_ok", "free_rent"]));
  });
});

describe("rf12 helpers", () => {
  it("parseTotalFloors は地下階を総階数と取り違えない", () => {
    expect(parseTotalFloors("地上32階 地下1階建")).toBe(32);
    expect(parseTotalFloors("地上３階　地下１階 RC造")).toBe(3);
    expect(parseTotalFloors("10階建て")).toBe(10);
    expect(parseTotalFloors("")).toBeNull();
  });
  it("parseStructure", () => {
    expect(parseStructure("地上15階 地下1階 SRC造")).toBe("SRC");
    expect(parseStructure("鉄筋コンクリート造")).toBe("RC");
    expect(parseStructure("軽量鉄骨造")).toBe("LGS");
    expect(parseStructure("木造")).toBe("W");
  });
  it("parseJpDate は JST の日付として扱う", () => {
    expect(parseJpDate("2026年10月13日")).toBe("2026-10-12T15:00:00.000Z");
    expect(parseJpDate("最終更新日: 2026/10/3")).toBe("2026-10-02T15:00:00.000Z");
  });
});
