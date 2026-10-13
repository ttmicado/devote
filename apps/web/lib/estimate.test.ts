import { describe, expect, it } from "vitest";
import { estimateMoveInCost, monthsOfRent } from "./estimate";

const base = {
  dealType: "rent" as const,
  usage: "residential" as const,
  price: 300_000,
  managementFee: 20_000,
  deposit: 600_000,
  keyMoney: 300_000,
};

describe("estimateMoveInCost", () => {
  it("敷金・礼金・仲介手数料（＋税）・前家賃（総額）を合計する", () => {
    const e = estimateMoveInCost(base);
    expect(e).toEqual({
      deposit: 600_000,
      keyMoney: 300_000,
      brokerage: 330_000,
      advanceRent: 320_000,
      total: 1_550_000,
      complete: true,
    });
  });

  it("敷金・礼金が不明なら推測せず、合計から外して complete=false", () => {
    const e = estimateMoveInCost({ ...base, deposit: null, keyMoney: 0 });
    expect(e?.deposit).toBeNull();
    expect(e?.keyMoney).toBe(0);
    expect(e?.total).toBe(330_000 + 320_000);
    expect(e?.complete).toBe(false);
  });

  it("管理費が無ければ前家賃は賃料のみ", () => {
    expect(estimateMoveInCost({ ...base, managementFee: null })?.advanceRent).toBe(300_000);
  });

  it("売買と事業用は対象外", () => {
    expect(estimateMoveInCost({ ...base, dealType: "sale" })).toBeNull();
    expect(estimateMoveInCost({ ...base, usage: "business" })).toBeNull();
  });
});

describe("monthsOfRent", () => {
  it("小数1桁で、整数なら小数を付けない", () => {
    expect(monthsOfRent(600_000, 300_000)).toBe("2");
    expect(monthsOfRent(450_000, 300_000)).toBe("1.5");
    expect(monthsOfRent(100_000, 300_000)).toBe("0.3");
  });
  it("賃料が無ければ null", () => {
    expect(monthsOfRent(100_000, 0)).toBeNull();
  });
});
