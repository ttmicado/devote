import { describe, expect, it } from "vitest";
import { addressInTowns, carryTowns, townsOf, withTowns } from "./town-filter.js";

describe("town-filter", () => {
  it("町名をフラグメントに載せて読み戻せる", () => {
    const url = withTowns("https://example.com/list?a=1", ["勝どき", "豊洲"]);
    expect(url).toBe(
      "https://example.com/list?a=1#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E8%B1%8A%E6%B4%B2",
    );
    expect(townsOf(url)).toEqual(["勝どき", "豊洲"]);
  });

  it("町名が無ければURLはそのまま・絞り込みなし", () => {
    expect(withTowns("https://example.com/list", [])).toBe("https://example.com/list");
    expect(townsOf("https://example.com/list")).toBeNull();
  });

  it("全角スペースや丁目付きの住所でも町名で判定する", () => {
    expect(addressInTowns("東京都中央区勝どき　６丁目", ["勝どき"])).toBe(true);
    expect(addressInTowns("中央区月島３丁目", ["勝どき"])).toBe(false);
  });

  it("次ページにも同じ絞り込みを引き継ぐ", () => {
    const cur = withTowns("https://example.com/list", ["豊洲"]);
    expect(carryTowns("https://example.com/list?page=2", cur)).toBe(
      "https://example.com/list?page=2#towns=%E8%B1%8A%E6%B4%B2",
    );
    expect(carryTowns(null, cur)).toBeNull();
    expect(carryTowns("https://example.com/list?page=2", "https://example.com/list")).toBe(
      "https://example.com/list?page=2",
    );
  });
});
