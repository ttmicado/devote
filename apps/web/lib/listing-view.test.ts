import type { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { areaText, buildingKey, freshHours, groupByBuilding, priceRange } from "./listing-view";

const L = (over: Partial<NormalizedListing>): NormalizedListing =>
  ({
    title: "パークコート赤坂",
    dealType: "rent",
    usage: "residential",
    address: { prefecture: "東京都", city: "港区", town: "赤坂", raw: "東京都港区赤坂" },
    price: 400_000,
    managementFee: 20_000,
    areaSqm: 70,
    ...over,
  }) as NormalizedListing;

describe("buildingKey", () => {
  it("部屋番号・階・全角の揺れをそろえる", () => {
    const k = buildingKey(L({}));
    expect(buildingKey(L({ title: "パークコート赤坂 1203" }))).toBe(k);
    expect(buildingKey(L({ title: "パークコート赤坂　１２０３号室" }))).toBe(k);
    expect(buildingKey(L({ title: "パークコート赤坂 12階" }))).toBe(k);
  });
  it("棟の記号（B / C）や取引種別が違えば別の建物", () => {
    expect(buildingKey(L({ title: "麻布台ヒルズレジデンス B" }))).not.toBe(
      buildingKey(L({ title: "麻布台ヒルズレジデンス C" })),
    );
    expect(buildingKey(L({ dealType: "sale" }))).not.toBe(buildingKey(L({})));
  });
  it("建物名が無ければ null", () => {
    expect(buildingKey(L({ title: null }))).toBeNull();
  });
});

describe("groupByBuilding", () => {
  it("並び順を保って、同じ建物を最初の1件にまとめる", () => {
    const items = [
      { id: "a", listing: L({ title: "A棟 101" }) },
      { id: "b", listing: L({ title: "B" }) },
      { id: "c", listing: L({ title: "A棟 302" }) },
    ];
    const g = groupByBuilding(items);
    expect(g.map((x) => x.lead.id)).toEqual(["a", "b"]);
    expect(g[0]?.others.map((x) => x.id)).toEqual(["c"]);
  });
});

describe("priceRange / areaText / freshHours", () => {
  it("総額の幅", () => {
    expect(priceRange([L({}), L({ price: 500_000 })])).toBe("42万〜52万円");
    expect(priceRange([L({})])).toBe("42万円");
  });
  it("事業用は坪を先に", () => {
    expect(areaText(L({ usage: "business", areaSqm: 99.8 }))).toBe("30.2坪（99.8㎡）");
    expect(areaText(L({}))).toBe("70㎡");
  });
  it("72時間以内だけ新着", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(freshHours(new Date("2026-10-13T09:00:00Z"), now)).toBe(3);
    expect(freshHours(new Date("2026-10-10T11:00:00Z"), now)).toBeNull();
  });
});
