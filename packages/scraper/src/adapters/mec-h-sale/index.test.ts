import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.mec-h.com";
const LIST = `${BASE}/buy/list?todohuken_cd=13&shikugun_cd%5B%5D=13103`;
const detail = (file: string, path: string) =>
  NormalizedListing.parse(adapter.normalize(adapter.parseDetail(fixture(file), `${BASE}${path}`)));

describe("mec-h-sale queries", () => {
  it("マンション（/buy）・一戸建（/house）× 区の一覧URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(12);
    expect(urls[0]).toBe(LIST);
    expect(urls).toContain(`${BASE}/house/list?todohuken_cd=13&shikugun_cd%5B%5D=13113`);
    expect(urls).toContain(
      `${BASE}/buy/list?todohuken_cd=13&shikugun_cd%5B%5D=13102#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E6%99%B4%E6%B5%B7`,
    );
  });
});

describe("mec-h-sale parseList", () => {
  it("物件コード・詳細URL・価格（万円）・次ページを取る（おすすめ物件は読まない）", () => {
    const r = adapter.parseList(fixture("list-mansion-minato-1.html"), LIST);
    expect(r.items).toHaveLength(30);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "D16X31443",
      detailUrl: `${BASE}/mansion/detail/D16X31443`,
      price: 118_000_000,
    });
    expect(r.nextPageUrl).toBe(`${BASE}/buy/list?todohuken_cd=13&shikugun_cd%5B0%5D=13103&page=2`);
    // マンションの一覧は売地が混ざるので件数照合しない
    expect(r.totalCount).toBeNull();
  });

  it("売地（/land/detail/…）は読み飛ばし、最終ページで止まる", () => {
    const r = adapter.parseList(fixture("list-mansion-minato-10.html"), `${LIST}&page=10`);
    expect(r.items).toHaveLength(28); // 30件のうち売地2件を除く
    expect(r.items.every((i) => i.detailUrl.includes("/mansion/detail/"))).toBe(true);
    expect(r.nextPageUrl).toBeNull();
  });

  it("一戸建の一覧は件数照合する。0件の一覧は空", () => {
    const r = adapter.parseList(
      fixture("list-house-shibuya-1.html"),
      `${BASE}/house/list?todohuken_cd=13&shikugun_cd%5B%5D=13113`,
    );
    expect(r.items).toHaveLength(7);
    expect(r.totalCount).toBe(7);
    expect(r.items[0]?.detailUrl).toMatch(/\/house\/detail\//);
    expect(
      adapter.parseList(fixture("list-house-chiyoda-empty.html"), `${BASE}/house/list`),
    ).toMatchObject({ items: [], nextPageUrl: null, totalCount: 0 });
  });

  it("町名で絞る一覧は勝どき・晴海だけ残す", () => {
    const r = adapter.parseList(
      fixture("list-mansion-chuo-1.html"),
      `${BASE}/buy/list?todohuken_cd=13&shikugun_cd%5B%5D=13102#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E6%99%B4%E6%B5%B7`,
    );
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThan(30);
    expect(r.nextPageUrl).toMatch(/page=2#towns=/);
  });
});

describe("mec-h-sale normalize", () => {
  it("中古マンションを正規化する", () => {
    expect(detail("detail-mansion-D16X31443.html", "/mansion/detail/D16X31443")).toMatchSnapshot();
  });

  it("所在地・駅名のリンクを残して読む。「11,800万円」「8,115円／月」「地上15階建て」", () => {
    expect(detail("detail-mansion-D16X31443.html", "/mansion/detail/D16X31443")).toMatchObject({
      dealType: "sale",
      propertyType: "mansion",
      address: { city: "港区", town: "南青山", raw: "東京都港区南青山６丁目" },
      price: 118_000_000,
      managementFee: 8_115,
      repairReserveFee: 7_300,
      areaSqm: 37.4,
      floor: 13,
      totalFloors: 15,
      structure: "RC",
      direction: "南西",
      stations: [
        { line: "東京メトロ銀座線", station: "表参道", walkMinutes: 10, busMinutes: null },
        { line: "都営大江戸線", station: "六本木", walkMinutes: 15, busMinutes: null },
        { line: "東京メトロ日比谷線", station: "広尾", walkMinutes: 16, busMinutes: null },
      ],
    });
  });

  it("一戸建は物件名を <title> から、建物面積・2LDK+S・写真を取る", () => {
    const n = detail("detail-house-D12X31185.html", "/house/detail/D12X31185");
    expect(n).toMatchObject({
      propertyType: "house",
      title: "渋谷区富ヶ谷２丁目の一戸建て",
      price: 158_000_000,
      layout: "2SLDK",
      areaSqm: 91.57,
      floor: null,
      totalFloors: 2,
      managementFee: null,
    });
    expect(n.imageUrls).toHaveLength(21);
    expect(n.imageUrls.every((u) => u.includes("D12X31185"))).toBe(true);
  });
});
