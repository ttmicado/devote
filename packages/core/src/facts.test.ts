import { describe, expect, it } from "vitest";
import { deriveContractFacts, parseTotalUnits } from "./facts";
import { parseAvailableFrom, parseContractType } from "./normalize";
import { NormalizedListing } from "./property";

const now = new Date("2026-10-13T00:00:00Z");

describe("parseAvailableFrom", () => {
  it.each([
    ["即入居可", "即入居可"],
    ["即日", "即入居可"],
    ["即", "即入居可"],
    ["即入居可 ※諸手続き完了次第", "即入居可"],
    ["相談", "相談"],
    ["要相談", "相談"],
    ["2026年11月下旬", "2026-11"],
    ["２０２７年１月上旬", "2027-01"],
    ["空室予定（退去予定：2026年11月）", "2026-11"],
    ["令和8年12月中旬", "2026-12"],
    ["12月中旬", "2026-12"],
    ["3月下旬", "2027-03"],
    ["原状回復次第随時", "原状回復次第随時"],
    ["-", null],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(parseAvailableFrom(input, now)).toBe(expected);
  });
});

describe("parseContractType", () => {
  it.each([
    ["定期借家契約（2年）", "fixed_term", 24],
    ["定期借家契約（原則3年）", "fixed_term", 36],
    ["定期借家契約 2年", "fixed_term", 24],
    ["定借", "fixed_term", null],
    ["普通借家契約", "normal", null],
    ["普通借家（2年）", "normal", 24],
    ["2年", null, 24],
    ["6ヶ月", null, 6],
    ["2028年3月31日まで", null, null],
  ])("%s → %s / %s", (input, type, months) => {
    expect(parseContractType(input)).toEqual({ contractType: type, termMonths: months });
  });
});

describe("parseTotalUnits", () => {
  it.each([
    ["38戸", 38],
    ["総戸数445戸、賃貸戸数106戸", 445],
    ["レジデンスA／35戸", 35],
    ["RC / 1,200戸", 1200],
    ["-", null],
  ])("%s → %s", (input, expected) => {
    expect(parseTotalUnits(input)).toBe(expected);
  });
});

const base = NormalizedListing.parse({
  source: "t",
  sourceListingId: "1",
  url: "https://example.com/1",
  dealType: "rent",
  title: "テスト",
  address: { prefecture: "東京都", city: "港区", town: "六本木", raw: "東京都港区六本木" },
  stations: [],
  price: 300_000,
  managementFee: 0,
  deposit: null,
  keyMoney: null,
  layout: "2LDK",
  areaSqm: 70,
  builtYearMonth: null,
  floor: 20,
  totalFloors: 20,
  structure: null,
  direction: null,
  features: [],
  transactionMode: "unknown",
  adAllowed: null,
  agencyName: null,
  imageUrls: [],
  sourceUpdatedAt: null,
  extra: {
    入居時期: "空室予定（退去予定：2026年11月）",
    契約形態: "定期借家契約（2年）",
    更新料: "なし",
    駐車場: "有 1台 27,500円",
    総戸数: "38戸",
  },
});

describe("deriveContractFacts", () => {
  it("既存データ（新しい項目なし）も null で読み込める", () => {
    expect(base.availableFrom).toBeNull();
    expect(base.contractType).toBeNull();
  });

  it("extra の表記から入居時期・契約・駐車場・総戸数を埋める", () => {
    const l = deriveContractFacts(base, now);
    expect(l).toMatchObject({
      availableFrom: "2026-11",
      contractType: "fixed_term",
      contractTermMonths: 24,
      renewalFee: "なし",
      parkingNote: "有 1台 27,500円",
      totalUnits: 38,
    });
    expect(l.features).toEqual(expect.arrayContaining(["fixed_term", "parking", "top_floor"]));
  });

  it("冪等（2回通しても同じ）", () => {
    const once = deriveContractFacts(base, now);
    expect(deriveContractFacts(once, now)).toEqual(once);
  });

  it("駐車場の空きがなければ parking を付けない。償却/更新料は更新料の側を取る", () => {
    const l = deriveContractFacts(
      {
        ...base,
        extra: { 駐車場: "空無 26,000～34,000円", "償却/更新料": "無 / 1.25ヶ月" },
      },
      now,
    );
    expect(l.features).not.toContain("parking");
    expect(l.renewalFee).toBe("1.25ヶ月");
  });

  it("売買の「定借」は定期借家として扱わない", () => {
    const l = deriveContractFacts(
      { ...base, dealType: "sale", features: ["fixed_term"], extra: { 契約形態: "定借" } },
      now,
    );
    expect(l.contractType).toBeNull();
    expect(l.features).not.toContain("fixed_term");
  });

  it("アダプターが入れた値は上書きしない", () => {
    const l = deriveContractFacts({ ...base, contractType: "normal" }, now);
    expect(l.contractType).toBe("normal");
    expect(l.features).not.toContain("fixed_term");
  });
});
