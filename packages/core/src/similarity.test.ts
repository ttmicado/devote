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
  usage: "residential",
  availableFrom: null,
  contractType: null,
  contractTermMonths: null,
  renewalFee: null,
  parkingNote: null,
  totalUnits: null,
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

  it("生活圏: 同じ町 > 同じ駅 > 同じ区", () => {
    const other = { line: null, station: "麻布十番", walkMinutes: 5, busMinutes: null };
    const sameTown = { ...base, stations: [other] };
    const sameStation = { ...base, address: { ...base.address, town: "西麻布" } };
    const sameCity = { ...base, address: { ...base.address, town: "西麻布" }, stations: [other] };
    const s = (l: NormalizedListing) => propertySimilarity(base, l);
    expect(s(sameTown)).toBeGreaterThan(s(sameStation));
    expect(s(sameStation)).toBeGreaterThan(s(sameCity));
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

describe("headlinePrice / keyFacts", async () => {
  const { headlinePrice, keyFacts } = await import("./format");
  it("賃貸は管理費込みの総額", () => {
    expect(headlinePrice(base)).toEqual({
      label: "総額／月",
      amount: "32万円",
      note: "賃料 30万円 ＋ 管理費 2万円",
    });
  });
  it("売買は価格と㎡単価", () => {
    expect(headlinePrice({ ...base, dealType: "sale", price: 150_000_000 })).toMatchObject({
      label: "価格",
      amount: "1億5,000万円",
      note: "㎡単価 214.3万円",
    });
  });
  it("一行の要点", () => {
    expect(keyFacts(base, new Date("2026-10-13"))).toEqual([
      "六本木",
      "2LDK 70㎡",
      "六本木 徒歩5分",
      "築11年",
      "10階",
    ]);
  });
});

describe("事業用の賃貸", async () => {
  const { headlinePrice, dealKindLabel } = await import("./format");
  const { scoreListing } = await import("./matching");
  const office = {
    ...base,
    usage: "business" as const,
    price: 1_000_000,
    managementFee: 100_000,
    areaSqm: 99.17,
    layout: null,
  };
  it("坪単価（共益費込み）を添える", () => {
    expect(headlinePrice(office)).toMatchObject({
      amount: "110万円",
      note: "坪単価 3.7万円（共益費込み）",
    });
    expect(dealKindLabel(office)).toEqual({ en: "Business", ja: "事業用賃貸" });
  });
  it("住まいの条件に事業用の物件は出さない", () => {
    const cond = {
      dealType: "rent" as const,
      usage: "residential" as const,
      areas: { stations: [], cities: ["港区"], towns: [], excludeTowns: [] },
      hard: {
        maxPrice: null,
        minAreaSqm: null,
        maxWalkMinutes: null,
        layouts: [],
        maxBuildingAgeYears: null,
        minFloor: null,
        requiredFeatures: [],
        minRooms: null,
        moveInBy: null,
        contract: { corporate: "either" as const, fixedTerm: "ok" as const },
        parking: { count: 0, note: null },
      },
      tolerance: { price: 0, areaSqm: 0, walkMinutes: 0, buildingAgeYears: 0 },
      soft: [],
      notes: "",
    };
    expect(scoreListing(office, cond).excluded).toBe(true);
    expect(scoreListing(office, { ...cond, usage: "business" }).excluded).toBe(false);
  });
});
