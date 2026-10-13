import { describe, expect, it } from "vitest";
import type { SearchCondition } from "./condition.js";
import { scoreListing, selectForPhase } from "./matching.js";
import type { NormalizedListing } from "./property.js";

const now = new Date("2026-10-13");

const base: NormalizedListing = {
  source: "test",
  sourceListingId: "1",
  url: "https://example.com/1",
  dealType: "rent",
  title: "テストマンション",
  address: { prefecture: "東京都", city: "目黒区", town: "上目黒", raw: "東京都目黒区上目黒" },
  stations: [{ line: "東急東横線", station: "中目黒", walkMinutes: 6, busMinutes: null }],
  price: 180_000,
  managementFee: 10_000,
  deposit: 180_000,
  keyMoney: 0,
  layout: "2LDK",
  areaSqm: 70,
  builtYearMonth: "2016-04",
  floor: 4,
  totalFloors: 8,
  structure: "RC",
  direction: "南",
  features: ["auto_lock", "separate_bath_toilet"],
  transactionMode: "general_agency",
  adAllowed: true,
  agencyName: null,
  imageUrls: [],
  sourceUpdatedAt: null,
};

const cond: SearchCondition = {
  dealType: "rent",
  areas: { stations: ["中目黒"], cities: [] },
  hard: {
    maxPrice: 200_000,
    minAreaSqm: 70,
    maxWalkMinutes: 8,
    layouts: ["2LDK", "2SLDK"],
    maxBuildingAgeYears: 15,
    minFloor: 2,
    requiredFeatures: [],
  },
  tolerance: { price: 10_000, areaSqm: 1, walkMinutes: 2, buildingAgeYears: 0 },
  soft: [
    { feature: "separate_bath_toilet", weight: 1 },
    { feature: "pet_ok", weight: 0.5 },
  ],
  notes: "",
};

describe("scoreListing", () => {
  it("全条件を満たせば高スコア", () => {
    const r = scoreListing(base, cond, now);
    expect(r.excluded).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("70㎡希望に69.5㎡は許容幅内で減点のみ（議事録の例）", () => {
    const r = scoreListing({ ...base, areaSqm: 69.5 }, cond, now);
    expect(r.excluded).toBe(false);
    expect(r.reasons).toContain("面積が0.5㎡不足");
    expect(r.score).toBeLessThan(scoreListing(base, cond, now).score);
  });

  it("許容幅を超えたら除外", () => {
    expect(scoreListing({ ...base, areaSqm: 68 }, cond, now).excluded).toBe(true);
  });

  it("賃料は管理費込みの総額で判定", () => {
    const r = scoreListing({ ...base, price: 200_000, managementFee: 15_000 }, cond, now);
    expect(r.excluded).toBe(true);
  });

  it("エリア外は除外", () => {
    const r = scoreListing(
      { ...base, stations: [{ line: null, station: "渋谷", walkMinutes: 3, busMinutes: null }] },
      cond,
      now,
    );
    expect(r).toMatchObject({ excluded: true, reasons: ["希望エリア外"] });
  });
});

describe("selectForPhase", () => {
  const items = [95, 88, 80, 72, 60, 40].map((score) => ({
    id: score,
    match: { score, excluded: false, reasons: [] },
  }));

  it("内見済み（ready）は厳選して最大3件", () => {
    expect(selectForPhase(items, "ready").map((i) => i.id)).toEqual([95, 88]);
  });

  it("情報収集段階（exploring）は広く見せる", () => {
    expect(selectForPhase(items, "exploring")).toHaveLength(5);
  });
});
