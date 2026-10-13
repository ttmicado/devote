import { describe, expect, it } from "vitest";
import type { SearchCondition } from "./condition";
import { scoreListing, selectForPhase } from "./matching";
import type { NormalizedListing } from "./property";

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

const cond: SearchCondition = {
  dealType: "rent",
  usage: "residential",
  areas: { stations: ["中目黒"], cities: [], towns: [], excludeTowns: [] },
  hard: {
    maxPrice: 200_000,
    minAreaSqm: 70,
    maxWalkMinutes: 8,
    layouts: ["2LDK", "2SLDK"],
    maxBuildingAgeYears: 15,
    minFloor: 2,
    requiredFeatures: [],
    minRooms: null,
    moveInBy: null,
    contract: { corporate: "either", fixedTerm: "ok" },
    parking: { count: 0, note: null },
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
    expect(r.reasons).toContain("面積はご希望より0.5㎡小さめです");
    expect(r.score).toBeLessThan(scoreListing(base, cond, now).score);
  });

  it("丸めると差が0になる程度の不足は違いとして出さない", () => {
    const r = scoreListing({ ...base, areaSqm: 69.97 }, cond, now);
    expect(r.reasons).toEqual([]);
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

describe("エリア（町名）", () => {
  const byCity: SearchCondition = {
    ...cond,
    areas: { stations: [], cities: ["目黒区"], towns: [], excludeTowns: [] },
  };

  it("外したい町は、区で当たっても除外する", () => {
    const r = scoreListing(
      base,
      { ...byCity, areas: { ...byCity.areas, excludeTowns: ["上目黒"] } },
      now,
    );
    expect(r.excluded).toBe(true);
  });

  it("町名を指定したら、区の中でもその町だけにする", () => {
    const only = { ...byCity, areas: { ...byCity.areas, towns: ["中町"] } };
    expect(scoreListing(base, only, now).excluded).toBe(true);
    const hit = { ...byCity, areas: { ...byCity.areas, towns: ["上目黒"] } };
    expect(scoreListing(base, hit, now).excluded).toBe(false);
  });

  it("丁目付きの町名でも一致する", () => {
    const l = { ...base, address: { ...base.address, town: "上目黒二丁目" } };
    const hit = { ...byCity, areas: { ...byCity.areas, towns: ["上目黒"] } };
    expect(scoreListing(l, hit, now).excluded).toBe(false);
  });
});

describe("間取り（部屋数の下限）", () => {
  const roomsCond: SearchCondition = { ...cond, hard: { ...cond.hard, layouts: [], minRooms: 2 } };

  it("2LDK以上 → 3LDK は通る、1LDK は除外", () => {
    expect(scoreListing({ ...base, layout: "3LDK" }, roomsCond, now).excluded).toBe(false);
    expect(scoreListing({ ...base, layout: "1LDK" }, roomsCond, now).excluded).toBe(true);
  });

  it("layouts と minRooms はどちらかを満たせばよい", () => {
    const both = { ...cond, hard: { ...cond.hard, layouts: ["1LDK"], minRooms: 3 } };
    expect(scoreListing({ ...base, layout: "1LDK" }, both, now).excluded).toBe(false);
    expect(scoreListing({ ...base, layout: "3LDK" }, both, now).excluded).toBe(false);
    expect(scoreListing({ ...base, layout: "2LDK" }, both, now).excluded).toBe(true);
  });
});

describe("入居時期", () => {
  const by = { ...cond, hard: { ...cond.hard, moveInBy: "2026-12" } };

  it("希望より後に空く物件は除外", () => {
    expect(scoreListing({ ...base, availableFrom: "2027-02" }, by, now).excluded).toBe(true);
  });

  it("即入居可・希望以前は減点なし", () => {
    const full = scoreListing(base, cond, now).score;
    expect(scoreListing({ ...base, availableFrom: "即入居可" }, by, now).score).toBe(full);
    expect(scoreListing({ ...base, availableFrom: "2026-11" }, by, now).score).toBe(full);
  });

  it("不明・相談は少し減点し「入居時期は要確認」", () => {
    for (const availableFrom of [null, "相談"]) {
      const r = scoreListing({ ...base, availableFrom }, by, now);
      expect(r.excluded).toBe(false);
      expect(r.reasons).toContain("入居時期は要確認");
      expect(r.score).toBeLessThan(scoreListing(base, cond, now).score);
    }
  });

  it("新しい項目がない古いデータでも動く", () => {
    const { availableFrom: _a, ...old } = base;
    const r = scoreListing(old as NormalizedListing, by, now);
    expect(r.reasons).toContain("入居時期は要確認");
  });
});

describe("契約条件", () => {
  it("法人契約希望なら「個人契約限定」は除外", () => {
    const c = {
      ...cond,
      hard: { ...cond.hard, contract: { corporate: "corporate", fixedTerm: "ok" } },
    } as SearchCondition;
    const r = scoreListing({ ...base, features: [...base.features, "individual_only"] }, c, now);
    expect(r.excluded).toBe(true);
    expect(r.reasons[0]).not.toMatch(/individual_only/);
  });

  it("個人契約希望なら「法人契約限定」は除外", () => {
    const c = {
      ...cond,
      hard: { ...cond.hard, contract: { corporate: "individual", fixedTerm: "ok" } },
    } as SearchCondition;
    expect(scoreListing({ ...base, features: ["corporate_only"] }, c, now).excluded).toBe(true);
  });

  it("定期借家NGなら contractType かタグで除外", () => {
    const c = {
      ...cond,
      hard: { ...cond.hard, contract: { corporate: "either", fixedTerm: "ng" } },
    } as SearchCondition;
    expect(scoreListing({ ...base, contractType: "fixed_term" }, c, now).excluded).toBe(true);
    expect(scoreListing({ ...base, features: ["fixed_term"] }, c, now).excluded).toBe(true);
    expect(scoreListing(base, c, now).excluded).toBe(false);
  });
});

describe("駐車場", () => {
  const car = { ...cond, hard: { ...cond.hard, parking: { count: 1, note: "SUV" } } };

  it("駐車場の情報がなければ除外せず、減点して「駐車場の空きは要確認」", () => {
    const r = scoreListing(base, car, now);
    expect(r.excluded).toBe(false);
    expect(r.reasons).toContain("駐車場の空きは要確認");
    expect(r.score).toBeLessThan(scoreListing(base, cond, now).score);
  });

  it("駐車場ありなら減点しない", () => {
    const r = scoreListing({ ...base, features: [...base.features, "parking"] }, car, now);
    expect(r.reasons).not.toContain("駐車場の空きは要確認");
  });
});

describe("不明な値は要確認として少し減点", () => {
  it("築年が不明", () => {
    const r = scoreListing({ ...base, builtYearMonth: null }, cond, now);
    expect(r.excluded).toBe(false);
    expect(r.reasons).toContain("築年数は要確認");
  });
  it("所在階が不明", () => {
    const r = scoreListing({ ...base, floor: null }, cond, now);
    expect(r.excluded).toBe(false);
    expect(r.reasons).toContain("所在階は要確認");
  });
});

describe("必須の入居条件と要相談", () => {
  const pet = { ...cond, hard: { ...cond.hard, requiredFeatures: ["pet_ok"] } };

  it("ペット可が必須で、物件がペット要相談なら減点して残す", () => {
    const r = scoreListing({ ...base, features: [...base.features, "pet_negotiable"] }, pet, now);
    expect(r.excluded).toBe(false);
    expect(r.reasons).toContain("ペットは要相談です");
    expect(r.score).toBeLessThan(
      scoreListing({ ...base, features: [...base.features, "pet_ok"] }, pet, now).score,
    );
  });

  it("満たさなければ除外し、理由はラベルで書く（IDを出さない）", () => {
    const r = scoreListing(base, pet, now);
    expect(r.excluded).toBe(true);
    expect(r.reasons[0]).toContain("ペット可");
    expect(r.reasons[0]).not.toContain("pet_ok");
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

  it("同点なら新しい物件 → 総額の安い順", () => {
    const tie = [
      {
        id: "old",
        createdAt: "2026-10-01T00:00:00Z",
        totalPrice: 100,
        match: { score: 90, excluded: false, reasons: [] },
      },
      {
        id: "newExpensive",
        createdAt: "2026-10-12T00:00:00Z",
        totalPrice: 300,
        match: { score: 90, excluded: false, reasons: [] },
      },
      {
        id: "newCheap",
        createdAt: "2026-10-12T00:00:00Z",
        totalPrice: 200,
        match: { score: 90, excluded: false, reasons: [] },
      },
      {
        id: "best",
        createdAt: "2026-09-01T00:00:00Z",
        totalPrice: 999,
        match: { score: 95, excluded: false, reasons: [] },
      },
    ];
    expect(selectForPhase(tie, "exploring").map((i) => i.id)).toEqual([
      "best",
      "newCheap",
      "newExpensive",
      "old",
    ]);
  });
});

describe("missingEssentials", async () => {
  const { missingEssentials } = await import("./condition");
  it("エリア・予算・広さ（間取り）がそろえば確定できる", () => {
    expect(missingEssentials(cond)).toEqual([]);
  });
  it("足りない項目を返す", () => {
    expect(
      missingEssentials({
        ...cond,
        areas: { stations: [], cities: [], towns: [], excludeTowns: [] },
        hard: { ...cond.hard, maxPrice: null, minAreaSqm: null, layouts: [] },
      }),
    ).toEqual(["area", "budget", "size"]);
    expect(missingEssentials({ ...cond, hard: { ...cond.hard, minAreaSqm: null } })).toEqual([]);
  });
});

describe("areaOnlyCondition", async () => {
  const { areaOnlyCondition } = await import("./matching");
  it("エリア外だけを除外し、ほかの条件では除外しない", () => {
    const strict = { ...cond, hard: { ...cond.hard, maxPrice: 1 } };
    expect(scoreListing(base, strict, now).excluded).toBe(true);
    expect(scoreListing(base, areaOnlyCondition(strict), now).excluded).toBe(false);
    const other = {
      ...base,
      stations: [{ line: null, station: "渋谷", walkMinutes: 3, busMinutes: null }],
    };
    expect(scoreListing(other, areaOnlyCondition(strict), now).excluded).toBe(true);
  });
});
