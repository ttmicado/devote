import { describe, expect, it } from "vitest";
import {
  buildingAgeYears,
  findDirection,
  parseAreaSqm,
  parseAreaSqmOrTsubo,
  parseBuiltYearMonth,
  parseFeeLoose,
  parseFloor,
  parseFloorLabel,
  parseJpDate,
  parseLayout,
  parseLayoutLoose,
  parseMonthsLoose,
  parseMonthsOrYen,
  parseStationAccess,
  parseStructure,
  parseTotalFloors,
  parseTsubo,
  parseYen,
  parseYenWithSymbol,
  tsuboToSqm,
  walkMinutesFromMeters,
  withPrefecture,
} from "./normalize";

describe("parseYen", () => {
  it.each([
    ["8.5万円", 85_000],
    ["８．５万円", 85_000],
    ["85,000円", 85_000],
    ["1億2,980万円", 129_800_000],
    ["4980万円", 49_800_000],
    ["なし", 0],
    ["月額30,020円", 30_020],
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

describe("parseTsubo / tsuboToSqm / parseAreaSqmOrTsubo", () => {
  it.each([
    ["27.48坪", 27.48],
    ["２７．４８ 坪", 27.48],
    ["30.3坪 (100.16㎡)", 30.3],
    ["90.84㎡", null],
    [null, null],
  ])("parseTsubo(%s) → %s", (input, expected) => {
    expect(parseTsubo(input)).toBe(expected);
  });

  it("1坪 = 3.30579㎡ で換算し、小数第2位で丸める", () => {
    expect(tsuboToSqm(1)).toBe(3.31);
    expect(tsuboToSqm(30.3)).toBe(100.17);
    expect(tsuboToSqm(437.77)).toBe(1447.18);
  });

  it.each([
    ["27.48坪 (90.84㎡)", 90.84], // ㎡の併記を優先
    ["30.3坪", 100.17],
    ["82.64m²", 82.64],
    ["0坪", null],
    ["相談", null],
  ])("parseAreaSqmOrTsubo(%s) → %s", (input, expected) => {
    expect(parseAreaSqmOrTsubo(input)).toBe(expected);
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
    ["地上32階 地下1階建", { floor: null, totalFloors: 32 }],
    ["15階／地上32階地下1階建", { floor: 15, totalFloors: 32 }],
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

describe("parseStructure", () => {
  it.each([
    ["鉄筋コンクリート造", "RC"],
    ["ＲＣ造　１０階建", "RC"],
    ["rc造", "RC"],
    ["PC造", "RC"],
    ["地上15階 地下1階 SRC造", "SRC"],
    ["鉄骨鉄筋コンクリート造　地上23階/地下1階", "SRC"],
    ["SRC造（CFT柱）、SRC造・RC造（地下）", "SRC"],
    ["軽量鉄骨造", "LGS"],
    ["S造", "S"],
    ["鉄骨造　地上43階　地下2階", "S"],
    // 主構造＋一部構造: 先に書かれた主構造を採る
    ["鉄骨造、一部鉄筋コンクリート造　地上43階　地下2階", "S"],
    ["鉄筋コンクリート造　一部　鉄骨造、鉄骨鉄筋コンクリート造", "RC"],
    ["一部鉄骨造 木造", "W"],
    ["木造", "W"],
    ["その他", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseStructure(input)).toBe(expected);
  });
});

describe("parseTotalFloors", () => {
  it.each([
    ["地上32階 地下1階建", 32],
    ["地上３階　地下１階 RC造", 3],
    ["鉄骨造、一部鉄筋コンクリート造　地上43階　地下2階", 43],
    ["地上43階・地下2階", 43],
    ["10階建て", 10],
    ["ＲＣ造　１０階建", 10],
    ["3階", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseTotalFloors(input)).toBe(expected);
  });
});

describe("parseFloorLabel", () => {
  it.each([
    ["36F", 36],
    ["３６Ｆ", 36],
    ["36階", 36],
    ["B1F", -1],
    ["b2", -2],
    ["地下1階", -1],
    ["36", null],
    ["3階/10階建", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseFloorLabel(input)).toBe(expected);
  });
});

describe("parseJpDate", () => {
  it.each([
    ["2026年10月13日", "2026-10-12T15:00:00.000Z"],
    ["2026/10/13", "2026-10-12T15:00:00.000Z"],
    ["最終更新日: 2026/10/3", "2026-10-02T15:00:00.000Z"],
    ["２０２６．１０．１３", "2026-10-12T15:00:00.000Z"],
    ["2026年 1月 1日", "2025-12-31T15:00:00.000Z"],
    ["2026年2月30日", null],
    ["2026年13月1日", null],
    ["2026年10月", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseJpDate(input)).toBe(expected);
  });
});

describe("withPrefecture", () => {
  it.each([
    ["千代田区神田猿楽町２", "東京都千代田区神田猿楽町2"],
    ["港区 南麻布 1-2-3", "東京都港区南麻布1-2-3"],
    ["北区赤羽", "東京都北区赤羽"],
    ["武蔵野市吉祥寺本町", "東京都武蔵野市吉祥寺本町"],
    ["横浜市中区山手町", "神奈川県横浜市中区山手町"],
    ["東京都港区赤坂", "東京都港区赤坂"],
    ["大阪府大阪市北区梅田", "大阪府大阪市北区梅田"],
    ["埼玉県さいたま市", "埼玉県さいたま市"],
    ["名古屋市中区", "名古屋市中区"],
  ])("%s → %s", (input, expected) => {
    expect(withPrefecture(input)).toBe(expected);
  });
});

describe("parseYenWithSymbol", () => {
  it.each([
    ["¥510,000", 510_000],
    ["￥1,230,000", 1_230_000],
    ["¥1,230,000（税込）", 1_230_000],
    ["¥510,000/月", 510_000],
    ["51万円", 510_000],
    ["お問い合わせ", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseYenWithSymbol(input)).toBe(expected);
  });
});

describe("parseMonthsLoose", () => {
  it.each([
    ["原則賃料の4ヶ月分", 2_000_000],
    ["賃料の2ヵ月", 1_000_000],
    ["1.5ヶ月", 750_000],
    ["2箇月", 1_000_000],
    ["なし", 0],
    ["賃料込み", 0],
    ["1,000,000円", 1_000_000],
    ["¥300,000", 300_000],
    ["", null],
    ["要相談", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseMonthsLoose(input, 500_000)).toBe(expected);
  });
});

describe("parseFeeLoose", () => {
  it.each([
    ["賃料込み", 0],
    ["賃料に含む（込み）", 0],
    ["なし", 0],
    ["-", 0],
    ["¥30,000", 30_000],
    ["20,000円", 20_000],
    ["お問い合わせ", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseFeeLoose(input)).toBe(expected);
  });
});

describe("parseLayoutLoose", () => {
  it.each([
    ["1BR", "1LDK"],
    ["2 BR", "2LDK"],
    ["3BR+S", "3SLDK"],
    ["3BR+F", "3LDK"],
    ["2BEDROOMS", "2LDK"],
    ["STUDIO", "1R"],
    ["Studio", "1R"],
    ["２ＬＤＫ", "2LDK"],
    ["ワンルーム", "1R"],
    ["お問い合わせ", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseLayoutLoose(input)).toBe(expected);
  });
});

describe("findDirection", () => {
  it.each([
    ["南向き", "南"],
    ["バルコニー：南東向き、角部屋", "南東"],
    ["北西向きのルーフバルコニー", "北西"],
    ["眺望良好", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(findDirection(input)).toBe(expected);
  });
});
