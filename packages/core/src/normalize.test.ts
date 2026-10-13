import { describe, expect, it } from "vitest";
import {
  buildingAgeYears,
  parseAreaSqm,
  parseBuiltYearMonth,
  parseFloor,
  parseLayout,
  parseMonthsOrYen,
  parseStationAccess,
  parseYen,
  walkMinutesFromMeters,
} from "./normalize.js";

describe("parseYen", () => {
  it.each([
    ["8.5万円", 85_000],
    ["８．５万円", 85_000],
    ["85,000円", 85_000],
    ["1億2,980万円", 129_800_000],
    ["4980万円", 49_800_000],
    ["なし", 0],
    ["-", 0],
    ["お問い合わせ", null],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(parseYen(input)).toBe(expected);
  });
});

describe("parseMonthsOrYen", () => {
  it("月数表記は賃料基準で円に変換", () => {
    expect(parseMonthsOrYen("1ヶ月", 85_000)).toBe(85_000);
    expect(parseMonthsOrYen("1.5ヵ月", 100_000)).toBe(150_000);
    expect(parseMonthsOrYen("10万円", 85_000)).toBe(100_000);
    expect(parseMonthsOrYen("なし", 85_000)).toBe(0);
  });
});

describe("parseAreaSqm", () => {
  it.each([
    ["25.5㎡", 25.5],
    ["70.12m²(壁芯)", 70.12],
    ["３０ｍ２", 30],
    ["69.5平米", 69.5],
    ["不明", null],
  ])("%s → %s", (input, expected) => {
    expect(parseAreaSqm(input)).toBe(expected);
  });
});

describe("parseLayout", () => {
  it.each([
    ["１ＬＤＫ", "1LDK"],
    ["1sldk", "1SLDK"],
    ["ワンルーム", "1R"],
    ["2LDK+S(納戸)", "2SLDK"],
    ["3DK", "3DK"],
    ["-", null],
  ])("%s → %s", (input, expected) => {
    expect(parseLayout(input)).toBe(expected);
  });
});

describe("parseStationAccess", () => {
  it("路線・駅・徒歩を分解", () => {
    expect(parseStationAccess("東急東横線「中目黒」駅 徒歩5分")).toEqual({
      line: "東急東横線",
      station: "中目黒",
      walkMinutes: 5,
      busMinutes: null,
    });
    expect(parseStationAccess("JR山手線/渋谷駅 歩7分")).toEqual({
      line: "JR山手線",
      station: "渋谷",
      walkMinutes: 7,
      busMinutes: null,
    });
  });

  it("バス便は徒歩と分けて構造化", () => {
    expect(parseStationAccess("京王線 調布駅 バス10分 停歩3分")).toEqual({
      line: "京王線",
      station: "調布",
      walkMinutes: 3,
      busMinutes: 10,
    });
  });
});

describe("walkMinutesFromMeters", () => {
  it("80m=1分、端数切り上げ", () => {
    expect(walkMinutesFromMeters(80)).toBe(1);
    expect(walkMinutesFromMeters(81)).toBe(2);
    expect(walkMinutesFromMeters(400)).toBe(5);
  });
});

describe("parseBuiltYearMonth", () => {
  it.each([
    ["2015年3月", "2015-03"],
    ["2015/03", "2015-03"],
    ["平成27年3月", "2015-03"],
    ["H27.3", "2015-03"],
    ["令和元年築", "2019-01"],
    ["昭和60年10月", "1985-10"],
    ["不明", null],
  ])("%s → %s", (input, expected) => {
    expect(parseBuiltYearMonth(input)).toBe(expected);
  });
});

describe("parseFloor", () => {
  it.each([
    ["3階/10階建", { floor: 3, totalFloors: 10 }],
    ["10階建の3階", { floor: 3, totalFloors: 10 }],
    ["地下1階/地上5階建", { floor: -1, totalFloors: 5 }],
    ["2階", { floor: 2, totalFloors: null }],
  ])("%s", (input, expected) => {
    expect(parseFloor(input)).toEqual(expected);
  });
});

describe("buildingAgeYears", () => {
  it("満年数", () => {
    expect(buildingAgeYears("2015-03", new Date("2026-10-13"))).toBe(11);
    expect(buildingAgeYears("2015-11", new Date("2026-10-13"))).toBe(10);
  });
});
