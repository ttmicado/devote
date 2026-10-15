import { describe, expect, it } from "vitest";
import { parseJpDate, parseStructure, parseTotalFloors } from "./helpers.js";

describe("helpers", () => {
  it("parseTotalFloors は地下階を総階数と取り違えない", () => {
    expect(parseTotalFloors("地上32階 地下1階建")).toBe(32);
    expect(parseTotalFloors("地上３階　地下１階 RC造")).toBe(3);
    expect(parseTotalFloors("10階建て")).toBe(10);
    expect(parseTotalFloors("")).toBeNull();
  });
  it("parseStructure", () => {
    expect(parseStructure("地上15階 地下1階 SRC造")).toBe("SRC");
    expect(parseStructure("鉄筋コンクリート造")).toBe("RC");
    expect(parseStructure("軽量鉄骨造")).toBe("LGS");
    expect(parseStructure("木造")).toBe("W");
  });
  it("parseJpDate は JST の日付として扱う", () => {
    expect(parseJpDate("2026年10月13日")).toBe("2026-10-12T15:00:00.000Z");
    expect(parseJpDate("最終更新日: 2026/10/3")).toBe("2026-10-02T15:00:00.000Z");
  });
});
