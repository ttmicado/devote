import { describe, expect, it } from "vitest";
import { normalizeAgencyName, normalizeBuildingName, sameAgency } from "./brands";

describe("normalizeAgencyName", () => {
  it.each([
    ["株式会社 ABC不動産", "abc不動産"],
    ["(株)ABC不動産", "abc不動産"],
    ["ＡＢＣ不動産㈱", "abc不動産"],
    ["ABC不動産 渋谷店", "abc不動産"],
    ["有限会社　ミナト・ハウス", "ミナトハウス"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeAgencyName(input)).toBe(expected);
  });

  it("空・null は一致扱いにしない", () => {
    expect(sameAgency(null, null)).toBe(false);
    expect(sameAgency("株式会社ABC不動産", "ABC不動産(株)")).toBe(true);
  });
});

describe("normalizeBuildingName", () => {
  it("部屋番号・空白を除く", () => {
    expect(normalizeBuildingName("パークコート 赤坂 1204号室")).toBe("パークコート赤坂");
    expect(normalizeBuildingName("ＰＡＲＫ ＣＯＵＲＴ")).toBe("parkcourt");
  });
});
