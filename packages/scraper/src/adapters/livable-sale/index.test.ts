import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.livable.co.jp";
const detail = (file: string, path: string) =>
  NormalizedListing.parse(adapter.normalize(adapter.parseDetail(fixture(file), `${BASE}${path}`)));

describe("livable-sale queries", () => {
  it("マンション・一戸建て × 区・町の一覧URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(14);
    expect(urls).toContain(`${BASE}/kounyu/mansion/tokyo/a13103/?sort=address`);
    expect(urls).toContain(`${BASE}/kounyu/kodate/tokyo/a13113/?sort=address`);
    expect(urls).toContain(`${BASE}/kounyu/mansion/tokyo/t13102034/?sort=address`); // 晴海
  });
});

describe("livable-sale parseList", () => {
  it("通常の詳細と GRANTACT の詳細のどちらも、詳細URLの物件番号を sourceListingId にする", () => {
    const r = adapter.parseList(
      fixture("list-mansion-minato-1.json"),
      `${BASE}/kounyu/mansion/tokyo/a13103/?sort=address`,
    );
    expect(r.items).toHaveLength(30);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "C48266B42",
      detailUrl: `${BASE}/grantact/detail/C48266B42`,
      price: 745_000_000,
    });
    expect(r.items.some((i) => i.detailUrl.startsWith(`${BASE}/mansion/`))).toBe(true);
    expect(r.totalCount).toBe(545);
    expect(r.nextPageUrl).toBe(`${BASE}/kounyu/mansion/tokyo/a13103/?sort=address&page=2`);
  });

  it("最終ページ（545件の19ページ目）で止まる", () => {
    const r = adapter.parseList(
      fixture("list-mansion-minato-19.json"),
      `${BASE}/kounyu/mansion/tokyo/a13103/?sort=address&page=19`,
    );
    expect(r.items).toHaveLength(5);
    expect(r.nextPageUrl).toBeNull();
  });

  it("一戸建ての一覧（総件数の空白を吸収）", () => {
    const r = adapter.parseList(
      fixture("list-kodate-minato-1.json"),
      `${BASE}/kounyu/kodate/tokyo/a13103/?sort=address`,
    );
    expect(r.items).toHaveLength(6);
    expect(r.totalCount).toBe(6);
    expect(r.items[0]?.detailUrl).toBe(`${BASE}/kodate/C48268E83/`);
  });
});

describe("livable-sale parseList（行の除外・skipped）", () => {
  const r = adapter.parseList(
    fixture("list-mansion-minato-19-mixed.json"),
    `${BASE}/kounyu/mansion/tokyo/a13103/?sort=address&page=19`,
  );

  it("自社以外の新築分譲サイト（l-shirokanetakanawa.jp）の行は throw せず黙って除外する", () => {
    expect(r.items).toHaveLength(5);
    expect(r.items.some((i) => !i.detailUrl.startsWith(`${BASE}/`))).toBe(false);
    expect(r.skipped?.join("\n") ?? "").not.toMatch(/l-shirokanetakanawa/);
    // 表示総件数には含まれるので、件数ずれの判定に足せるよう除外数を返す
    expect(r.excludedCount).toBe(1);
  });

  it("自社ドメインだが形式が想定外の行は skipped に入れる", () => {
    expect(r.skipped).toEqual([
      "C13269999: 詳細URLが解釈できない（/kounyu/mansion/unknown/C13269999/）",
    ]);
  });

  it("問題のない一覧では skipped を返さない", () => {
    const ok = adapter.parseList(
      fixture("list-mansion-minato-19.json"),
      `${BASE}/kounyu/mansion/tokyo/a13103/?sort=address&page=19`,
    );
    expect(ok.skipped).toBeUndefined();
  });
});

describe("livable-sale normalize", () => {
  it("中古マンション（通常の詳細）を正規化する", () => {
    expect(detail("detail-mansion-C13262R30.json", "/mansion/C13262R30/")).toMatchSnapshot();
  });

  it("「壁芯49.90m2」「4階 / 地上14階」「10,980（円/月）」を吸収する", () => {
    expect(detail("detail-mansion-C13262R30.json", "/mansion/C13262R30/")).toMatchObject({
      dealType: "sale",
      propertyType: "mansion",
      price: 109_990_000,
      managementFee: 10_980,
      repairReserveFee: 15_970,
      areaSqm: 49.9,
      floor: 4,
      totalFloors: 14,
      structure: "SRC",
    });
  });

  it("GRANTACT の詳細（表）を正規化する。写真は背景画像からスマホ用を除いて取る", () => {
    const n = detail("detail-grantact-C48266B42.html", "/grantact/detail/C48266B42");
    expect(n).toMatchObject({
      title: "三田ガーデンヒルズ サウスヒル",
      price: 745_000_000,
      managementFee: 76_160,
      repairReserveFee: 20_720,
      layout: "2LDK",
      areaSqm: 85.28,
      floor: 13,
      totalFloors: 14,
      builtYearMonth: "2024-12",
    });
    expect(n.imageUrls.length).toBeGreaterThan(0);
    expect(
      n.imageUrls.every((u) => u.includes("/grantact/img/upload/") && !u.includes("_sp/")),
    ).toBe(true);
  });

  it("25億円超の価格も円の整数で取る（通常の詳細は円の数値、GRANTACT は「億」表記）", () => {
    const json = adapter.parseDetail(
      fixture("detail-mansion-C13262R30.json"),
      `${BASE}/mansion/C13262R30/`,
    );
    expect(
      adapter.normalize({ ...json, fields: { ...json.fields, 価格: "2580000000" } }).price,
    ).toBe(2_580_000_000);
    const grantact = adapter.parseDetail(
      fixture("detail-grantact-C48266B42.html"),
      `${BASE}/grantact/detail/C48266B42`,
    );
    expect(
      adapter.normalize({ ...grantact, fields: { ...grantact.fields, 価格: "25億8,000万円" } })
        .price,
    ).toBe(2_580_000_000);
  });

  it("一戸建ては建物面積・所在階なし・「鉄骨造 3階」から総階数", () => {
    expect(detail("detail-kodate-C48268E83.json", "/kodate/C48268E83/")).toMatchObject({
      propertyType: "house",
      price: 598_000_000,
      areaSqm: 147.93,
      floor: null,
      totalFloors: 3,
      structure: "S",
      managementFee: null,
    });
  });
});
