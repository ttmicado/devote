import { describe, expect, it } from "vitest";
import {
  extractFeatures,
  FEATURE_DICTIONARY,
  featureSubject,
  floorFeatures,
  NEGOTIABLE_OF,
  negotiableVariant,
} from "./features";

const has = (text: string, tag: string) => extractFeatures(text).includes(tag);

describe("extractFeatures: 入居条件", () => {
  it.each([
    ["ペット可", "pet_ok"],
    ["ペット飼育可", "pet_ok"],
    ["ペット飼育ＯＫ", "pet_ok"],
    ["小型犬可", "pet_ok"],
    ["猫可", "pet_ok"],
    ["ペット相談", "pet_negotiable"],
    ["ペット相談(小型犬・猫2匹まで、詳細要確認)", "pet_negotiable"],
    ["大型犬可", "large_dog_ok"],
    ["楽器可", "instrument_ok"],
    ["楽器演奏可", "instrument_ok"],
    ["ピアノ可", "instrument_ok"],
    ["楽器相談", "instrument_negotiable"],
    ["事務所使用可", "office_ok"],
    ["事務所可", "office_ok"],
    ["SOHO可", "office_ok"],
    ["ＳＯＨＯ可", "office_ok"],
    ["事務所相談", "office_negotiable"],
    ["二人入居可", "two_person_ok"],
    ["2人入居", "two_person_ok"],
    ["二人入居相談", "two_person_negotiable"],
    ["法人登記可", "corp_registration_ok"],
  ])("%s → %s", (text, tag) => {
    expect(has(text, tag)).toBe(true);
  });

  it.each([
    ["二人入居不可", "two_person_ok"],
    ["二人入居相談", "two_person_ok"],
    ["ペット不可", "pet_ok"],
    ["ペット不可", "pet_negotiable"],
    ["ペット相談", "pet_ok"],
    ["ペット可否：要確認", "pet_ok"],
    ["楽器不可", "instrument_ok"],
    ["楽器相談", "instrument_ok"],
    ["住居兼事務所不可", "office_ok"],
    ["事務所使用不可", "office_ok"],
    ["事務所相談", "office_ok"],
    ["法人登記不可", "corp_registration_ok"],
    ["大型犬不可、小型犬可", "large_dog_ok"],
  ])("%s では %s を付けない", (text, tag) => {
    expect(has(text, tag)).toBe(false);
  });

  it("複数の条件が混ざっていても、それぞれ独立に判定する", () => {
    const tags = extractFeatures("ペット相談、住居兼事務所不可、二人入居可、楽器不可");
    expect(tags).toEqual(expect.arrayContaining(["pet_negotiable", "two_person_ok"]));
    expect(tags).not.toContain("office_ok");
    expect(tags).not.toContain("instrument_ok");
    expect(tags).not.toContain("pet_ok");
  });
});

describe("extractFeatures: 高級賃貸の設備", () => {
  it.each([
    ["コンシェルジュサービス", "concierge"],
    ["24時間有人管理", "staffed_24h"],
    ["管理人日勤", "manager_resident"],
    ["セコム", "security_company"],
    ["内廊下", "inner_corridor"],
    ["敷地内駐車場", "parking"],
    ["駐車場有 1台", "parking"],
    ["平置き駐車場", "parking_flat"],
    ["EV充電設備", "ev_charger"],
    ["ディスポーザー", "disposer"],
    ["床暖房", "floor_heating"],
    ["食器洗乾燥機", "dishwasher"],
    ["食洗機", "dishwasher"],
    ["ウォークインクローゼット", "walk_in_closet"],
    ["フィットネスジム", "gym"],
    ["ラウンジ", "lounge"],
    ["ゲストルーム", "guest_room"],
    ["24時間ゴミ出し可", "garbage_24h"],
    ["免震構造", "seismic"],
    ["眺望良好", "view"],
    ["東京タワーを望む", "view"],
    ["ルーフバルコニー", "roof_balcony"],
    ["最上階", "top_floor"],
    ["家具・家電付", "furnished"],
    ["分譲賃貸", "condo_for_rent"],
    ["定期借家契約（2年）", "fixed_term"],
    ["法人契約限定", "corporate_only"],
    ["個人契約のみ", "individual_only"],
  ])("%s → %s", (text, tag) => {
    expect(has(text, tag)).toBe(true);
  });

  it.each([
    ["駐車場なし", "parking"],
    ["駐車場 空無", "parking"],
    ["耐震構造", "seismic"],
    ["眺望なし", "view"],
    ["24時間換気システム", "staffed_24h"],
  ])("%s では %s を付けない", (text, tag) => {
    expect(has(text, tag)).toBe(false);
  });
});

describe("extractFeatures: 事業用", () => {
  it.each([
    ["スケルトン渡し", "skeleton"],
    ["居抜き", "inukuki"],
    ["飲食可", "food_ok"],
    ["軽飲食可", "food_ok"],
    ["重飲食可", "heavy_food_ok"],
    ["飲食相談", "food_negotiable"],
    ["OAフロア", "oa_floor"],
    ["個別空調", "individual_ac"],
    ["24時間利用可", "access_24h"],
    ["看板設置可", "signage_ok"],
    ["路面店", "street_level"],
    ["分割可", "divisible"],
    ["トイレ男女別", "separate_restroom"],
  ])("%s → %s", (text, tag) => {
    expect(has(text, tag)).toBe(true);
  });

  it.each([
    ["飲食不可", "food_ok"],
    ["重飲食不可", "heavy_food_ok"],
    ["看板設置不可", "signage_ok"],
  ])("%s では %s を付けない", (text, tag) => {
    expect(has(text, tag)).toBe(false);
  });

  it("「重飲食不可・軽飲食可」は飲食可だが重飲食可ではない", () => {
    const tags = extractFeatures("重飲食不可・軽飲食可");
    expect(tags).toContain("food_ok");
    expect(tags).not.toContain("heavy_food_ok");
  });
});

describe("辞書の整合性", () => {
  it("既存のタグIDを維持する（保存済みの条件で使っている）", () => {
    for (const id of [
      "auto_lock",
      "separate_bath_toilet",
      "independent_washbasin",
      "indoor_laundry",
      "delivery_box",
      "reheating_bath",
      "bathroom_dryer",
      "free_internet",
      "air_conditioner",
      "system_kitchen",
      "two_burner_stove",
      "pet_ok",
      "instrument_ok",
      "office_ok",
      "two_person_ok",
      "designers",
      "renovated",
      "corner_room",
      "free_rent",
    ]) {
      expect(FEATURE_DICTIONARY[id]).toBeDefined();
    }
  });

  it("要相談タグは対応する「可」タグを指す", () => {
    for (const [neg, ok] of Object.entries(NEGOTIABLE_OF)) {
      expect(FEATURE_DICTIONARY[ok], neg).toBeDefined();
    }
    expect(negotiableVariant("pet_ok")).toBe("pet_negotiable");
    expect(negotiableVariant("auto_lock")).toBeNull();
    expect(featureSubject("pet_ok")).toBe("ペット");
    expect(featureSubject("office_ok")).toBe("事務所");
  });

  it("最上階は所在階と総階数から付ける", () => {
    expect(floorFeatures(10, 10)).toEqual(["top_floor"]);
    expect(floorFeatures(9, 10)).toEqual([]);
    expect(floorFeatures(2, 2)).toEqual([]);
    expect(floorFeatures(null, 10)).toEqual([]);
  });
});

describe("可と要相談が並ぶとき", () => {
  it("「ペット可」と「大型犬相談可」なら pet_ok だけ", () => {
    const tags = extractFeatures("大型犬相談可 ペット可（一部住戸除く）");
    expect(tags).toContain("pet_ok");
    expect(tags).not.toContain("pet_negotiable");
  });
});
