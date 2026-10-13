import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isInTargetArea, NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.axel-home.com";
const KACHIDOKI = `${BASE}/areas/result?usage=residence&city_ids%5B0%5D=175`;
const detail = (property: string, room: string) =>
  NormalizedListing.parse(
    adapter.normalize(
      adapter.parseDetail(
        fixture(`detail-${room}.html`),
        `${BASE}/property/${property}/outline/${room}?usage=residence`,
      ),
    ),
  );

describe("axel-home queries", () => {
  it("区ページと町名（勝どき・豊洲）の一覧URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toEqual([
      `${BASE}/areas/minato?usage=residence`,
      `${BASE}/areas/shibuya?usage=residence`,
      `${BASE}/areas/chiyoda?usage=residence`,
      `${BASE}/areas/shinagawa?usage=residence`,
      KACHIDOKI,
      `${BASE}/areas/result?usage=residence&city_ids%5B0%5D=2`,
    ]);
  });
});

describe("axel-home parseList", () => {
  it("建物ごとの空室カードから部屋ID・詳細URL・賃料・次ページを取る", () => {
    const r = adapter.parseList(fixture("list-kachidoki-1.html"), KACHIDOKI);
    expect(r.items).toHaveLength(47);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "r44026",
      detailUrl: `${BASE}/property/1365/outline/r44026?usage=residence`,
      price: 235_000,
    });
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(47);
    expect(r.nextPageUrl).toBe(`${KACHIDOKI}&page=2`);
    // 「計N件」は空室0を含む建物数なので使わない
    expect(r.totalCount).toBeNull();
  });

  it("空室0の建物が並ぶページで巡回を打ち切る", () => {
    const r = adapter.parseList(fixture("list-kachidoki-11.html"), `${KACHIDOKI}&page=11`);
    expect(r.items).toHaveLength(0);
    expect(r.nextPageUrl).toBeNull();
  });
});

describe("axel-home normalize", () => {
  it("部屋詳細を NormalizedListing に正規化する", () => {
    expect(detail("1365", "r44026")).toMatchSnapshot();
  });

  it("写真（間取り図・外観・室内）を絶対URLで全件拾う", () => {
    const n = detail("1365", "r44026");
    expect(n.imageUrls).toHaveLength(27);
    expect(n.imageUrls[0]).toMatch(/^https:\/\/www\.axel-home\.com\/image-proxy\?path=/);
  });

  it("「1ヶ月/1.75ヶ月」「0円」「鉄骨鉄筋コンクリート(SRC) 地上14階建て」、見出しの所在階", () => {
    const n = detail("11805", "r221105");
    expect(n).toMatchObject({
      price: 294_000,
      managementFee: 0,
      deposit: 294_000,
      keyMoney: 514_500,
      layout: "3LDK",
      areaSqm: 68.23,
      floor: 17,
      totalFloors: 26,
      transactionMode: "brokerage",
    });
    const n2 = detail("14249", "r191199");
    expect(n2).toMatchObject({ structure: "SRC", totalFloors: 14, floor: 2, deposit: 0 });
    expect(n2.features).toContain("free_rent"); // 備考「フリーレント1ヶ月」
    expect(isInTargetArea(n2.address.raw)).toBe(true);
  });

  it("全角の賃料・敷礼表記を吸収し、賃料がなければ throw する", () => {
    const raw = adapter.parseDetail(
      fixture("detail-r44026.html"),
      `${BASE}/property/1365/outline/r44026?usage=residence`,
    );
    const n = adapter.normalize({
      ...raw,
      fields: { ...raw.fields, 賃料: "２３．５万円", "敷金/礼金": "なし／1ヶ月", 管理費: "-" },
    });
    expect(n).toMatchObject({ price: 235_000, deposit: 0, keyMoney: 235_000, managementFee: 0 });
    expect(() => adapter.normalize({ ...raw, fields: { ...raw.fields, 賃料: "" } })).toThrow(
      /賃料/,
    );
  });
});
