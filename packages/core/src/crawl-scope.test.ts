import { describe, expect, it } from "vitest";
import { SearchCondition } from "./condition";
import { crawlScopes } from "./crawl-scope";

const cond = (over: {
  dealType?: "rent" | "sale";
  usage?: "residential" | "business";
  cities?: string[];
  stations?: string[];
  maxPrice?: number | null;
  priceTol?: number;
  minArea?: number | null;
  areaTol?: number;
  layouts?: string[];
  minRooms?: number | null;
}) =>
  SearchCondition.parse({
    dealType: over.dealType ?? "rent",
    usage: over.usage ?? "residential",
    areas: { stations: over.stations ?? [], cities: over.cities ?? ["港区"] },
    hard: {
      maxPrice: over.maxPrice === undefined ? 500_000 : over.maxPrice,
      minAreaSqm: over.minArea === undefined ? 60 : over.minArea,
      maxWalkMinutes: null,
      layouts: over.layouts ?? [],
      minRooms: over.minRooms ?? null,
      maxBuildingAgeYears: null,
      minFloor: null,
      requiredFeatures: [],
    },
    tolerance: { price: over.priceTol ?? 0, areaSqm: over.areaTol ?? 0 },
    soft: [],
  });

describe("crawlScopes（希望条件から会員サイトの検索範囲を作る）", () => {
  it("条件がなければ検索しない", () => {
    expect(crawlScopes([])).toEqual([]);
  });

  it("matching で除外される境界（上限＋許容幅、下限−許容幅）を使う", () => {
    const [s] = crawlScopes([cond({ priceTol: 50_000, minArea: 60, areaTol: 5, minRooms: 2 })]);
    expect(s).toEqual({
      dealType: "rent",
      prefecture: "東京都",
      city: "港区",
      town: null,
      maxPrice: 550_000,
      minAreaSqm: 55,
      minRooms: 2,
    });
  });

  it("同じエリアを希望する複数の条件は、最も緩い境界にまとめる", () => {
    const scopes = crawlScopes([
      cond({ maxPrice: 400_000, minArea: 70 }),
      cond({ maxPrice: 800_000, minArea: 50 }),
    ]);
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({ maxPrice: 800_000, minAreaSqm: 50 });
    // 1人でも上限なしなら上限なし
    const open = crawlScopes([
      cond({ maxPrice: 400_000 }),
      cond({ maxPrice: null, minArea: null }),
    ]);
    expect(open[0]).toMatchObject({ maxPrice: null, minAreaSqm: null });
  });

  it("賃貸と売買、エリアは別々の範囲になる。対象外の区は含めない", () => {
    const scopes = crawlScopes([
      cond({ cities: ["港区", "目黒区"] }),
      cond({ dealType: "sale", cities: ["中央区"], maxPrice: 150_000_000 }),
    ]);
    expect(scopes.map((s) => `${s.dealType}-${s.city}${s.town ?? ""}`).sort()).toEqual([
      "rent-港区",
      "sale-中央区勝どき",
    ]);
  });

  it("区の指定がない（駅だけ）・駅の指定もある条件は全エリアを見る", () => {
    expect(crawlScopes([cond({ cities: [], stations: ["麻布十番"] })])).toHaveLength(6);
    expect(crawlScopes([cond({ cities: ["港区"], stations: ["勝どき"] })])).toHaveLength(6);
  });

  it("間取り: layouts と minRooms のどちらかを満たせばよいので部屋数は小さい方。1部屋なら絞らない", () => {
    expect(crawlScopes([cond({ layouts: ["2LDK", "3LDK"] })])[0]?.minRooms).toBe(2);
    expect(crawlScopes([cond({ layouts: ["3LDK"], minRooms: 2 })])[0]?.minRooms).toBe(2);
    expect(crawlScopes([cond({ layouts: ["1LDK", "2LDK"] })])[0]?.minRooms).toBeNull();
    expect(crawlScopes([cond({})])[0]?.minRooms).toBeNull();
  });

  it("事業用の条件は含めない", () => {
    expect(crawlScopes([cond({ usage: "business" })])).toEqual([]);
  });
});
