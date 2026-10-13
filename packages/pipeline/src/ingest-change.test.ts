import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { classifyChange } from "./ingest";

const base = NormalizedListing.parse({
  source: "t",
  sourceListingId: "1",
  url: "https://example.com/1",
  dealType: "rent",
  title: "テスト",
  address: { prefecture: "東京都", city: "港区", town: "六本木", raw: "東京都港区六本木" },
  stations: [],
  price: 300_000,
  managementFee: 20_000,
  deposit: null,
  keyMoney: 300_000,
  layout: "2LDK",
  areaSqm: 70,
  builtYearMonth: null,
  floor: 3,
  totalFloors: 10,
  structure: null,
  direction: null,
  features: [],
  transactionMode: "unknown",
  adAllowed: null,
  agencyName: null,
  imageUrls: [],
  sourceUpdatedAt: null,
});

describe("classifyChange", () => {
  it("賃貸は管理費込みの総額で値下げを判定する", () => {
    expect(classifyChange(base, { ...base, price: 290_000 }).type).toBe("price_down");
    // 賃料は下がったが管理費が上がって総額は同じ → 値下げではない
    expect(classifyChange(base, { ...base, price: 290_000, managementFee: 30_000 }).type).toBe(
      "field_changed",
    );
    expect(classifyChange(base, { ...base, managementFee: 25_000 }).type).toBe("price_up");
  });

  it("礼金の減額・フリーレントの追加は条件の改善", () => {
    expect(classifyChange(base, { ...base, keyMoney: 0 })).toEqual({
      type: "field_changed",
      improved: true,
    });
    expect(classifyChange(base, { ...base, features: ["free_rent"] }).improved).toBe(true);
    expect(classifyChange(base, { ...base, title: "別名" }).improved).toBe(false);
  });
});
