import { describe, expect, it } from "vitest";
import { isInTargetArea, splitAddress } from "./areas.js";

describe("isInTargetArea", () => {
  it.each([
    ["東京都港区六本木6丁目", true],
    ["東京都中央区勝どき６丁目", true],
    ["東京都中央区晴海1丁目", false],
    ["東京都江東区豊洲5-6", true],
    ["東京都江東区有明1丁目", false],
    ["渋谷区神宮前", true],
    ["東京都目黒区上目黒", false],
  ])("%s → %s", (addr, expected) => {
    expect(isInTargetArea(addr)).toBe(expected);
  });
});

describe("splitAddress", () => {
  it("丁目・番地を除いた町名", () => {
    expect(splitAddress("東京都中央区勝どき６丁目3-1")).toEqual({
      prefecture: "東京都",
      city: "中央区",
      town: "勝どき",
    });
    expect(splitAddress("港区六本木1-2-3")).toEqual({
      prefecture: null,
      city: "港区",
      town: "六本木",
    });
  });
});
