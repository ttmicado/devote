import { describe, expect, it } from "vitest";
import { formatYen } from "./format";
import type { NormalizedListing } from "./property";
import { propertySimilarity } from "./similarity";

const base: NormalizedListing = {
  source: "t",
  sourceListingId: "1",
  url: "https://example.com/1",
  dealType: "rent",
  title: "A",
  address: { prefecture: "東京都", city: "港区", town: "六本木", raw: "東京都港区六本木" },
  stations: [{ line: null, station: "六本木", walkMinutes: 5, busMinutes: null }],
  price: 300_000,
  managementFee: 20_000,
  deposit: null,
  keyMoney: null,
  layout: "2LDK",
  areaSqm: 70,
  builtYearMonth: "2015-01",
  floor: 10,
  totalFloors: 20,
  structure: "RC",
  direction: "南",
  features: ["auto_lock", "delivery_box"],
  transactionMode: "general_agency",
  adAllowed: null,
  agencyName: null,
  imageUrls: [],
  sourceUpdatedAt: null,
  repairReserveFee: null,
  propertyType: "mansion",
  extra: {},
};

describe("propertySimilarity", () => {
  it("近い物件ほど高い", () => {
    const near = { ...base, sourceListingId: "2", price: 310_000, areaSqm: 68 };
    const far = {
      ...base,
      sourceListingId: "3",
      price: 120_000,
      areaSqm: 25,
      layout: "1K",
      address: { ...base.address, city: "品川区" },
      stations: [{ line: null, station: "大崎", walkMinutes: 5, busMinutes: null }],
    };
    expect(propertySimilarity(base, near)).toBeGreaterThan(0.85);
    expect(propertySimilarity(base, far)).toBeLessThan(0.4);
  });

  it("賃貸と売買は比較しない", () => {
    expect(propertySimilarity(base, { ...base, dealType: "sale" })).toBe(0);
  });
});

describe("formatYen", () => {
  it.each([
    [185_000, "18.5万円"],
    [300_000, "30万円"],
    [129_800_000, "1億2,980万円"],
    [200_000_000, "2億円"],
    [5_000, "5,000円"],
  ])("%s → %s", (y, s) => expect(formatYen(y)).toBe(s));
});
