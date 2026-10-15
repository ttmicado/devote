import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.mec-h.com";
const LIST = `${BASE}/rent/list/building?todohuken_cd=13&shikugun_cd%5B%5D=13103`;
const detail = (id: string) =>
  NormalizedListing.parse(
    adapter.normalize(
      adapter.parseDetail(fixture(`detail-${id}.html`), `${BASE}/rent/detail/${id}`),
    ),
  );

describe("mec-h queries", () => {
  it("区ごとの一覧URLを作る（中央区・江東区は勝どき・豊洲に絞る）", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(6);
    expect(urls[0]).toBe(LIST);
    expect(urls).toContain(
      `${BASE}/rent/list/building?todohuken_cd=13&shikugun_cd%5B%5D=13108#towns=%E8%B1%8A%E6%B4%B2`,
    );
  });
});

describe("mec-h parseList", () => {
  it("建物ごとの空室行から物件コード・詳細URL・賃料を取る", () => {
    const r = adapter.parseList(fixture("list-minato-1.html"), LIST);
    expect(r.items).toHaveLength(57);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "H00907000049",
      detailUrl: `${BASE}/rent/detail/H00907000049`,
      price: 334_000,
    });
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(57);
    expect(r.nextPageUrl).toBeNull();
    expect(r.totalCount).toBeNull(); // 表示の件数は棟数
  });

  it("アコーディオンに畳まれた部屋も含めて全件拾う（品川区 22棟 136室）", () => {
    expect(adapter.parseList(fixture("list-shinagawa-1.html"), LIST).items).toHaveLength(136);
  });

  it("30棟を超える一覧は次ページへ進み、最終ページで止まる", () => {
    const first = adapter.parseList(fixture("list-multi-1.html"), LIST);
    expect(first.nextPageUrl).toMatch(/&page=2$/);
    const last = adapter.parseList(fixture("list-multi-4.html"), LIST);
    expect(last.items.length).toBeGreaterThan(0);
    expect(last.nextPageUrl).toBeNull();
  });

  it("町名で絞る一覧は対象の町の建物だけ残す", () => {
    // 中央区の1ページ目（日本橋・月島・晴海など）に勝どきは無い
    const r = adapter.parseList(fixture("list-chuo-1.html"), `${LIST}#towns=勝どき`);
    expect(r.items).toHaveLength(0);
    const all = adapter.parseList(fixture("list-chuo-1.html"), LIST);
    expect(all.items).toHaveLength(83);
  });
});

describe("mec-h normalize", () => {
  it("詳細を NormalizedListing に正規化する", () => {
    expect(detail("H00907000066")).toMatchSnapshot();
  });

  it("「管理費 -」は0円、「礼金 -」は0円、「地上11階」「鉄筋コンクリート造（RC）」を吸収する", () => {
    expect(detail("R3430621r602")).toMatchObject({
      title: "プライムガーデン西麻布",
      price: 447_000,
      managementFee: 0,
      deposit: 447_000,
      keyMoney: 0,
      layout: "2LDK",
      areaSqm: 67.26,
      floor: 6,
      totalFloors: 11,
      structure: "RC",
      direction: "東",
      transactionMode: "owner",
    });
  });

  it("利用の制限「ペット：相談可」「楽器：相談可」をタグにする", () => {
    expect(detail("H00907000066").features).toEqual(
      expect.arrayContaining(["pet_negotiable", "instrument_negotiable"]),
    );
  });

  it("写真はこの物件コードのファイルだけ（おすすめ物件の写真は除く）", () => {
    expect(detail("H00907000066").imageUrls).toEqual([
      "https://cdn.prd2026.www.mec-h.com/bkn_img/photo/D34/H00907000066.jpg",
      "https://cdn.prd2026.www.mec-h.com/bkn_img/photo/D34/H00907000066A.jpg",
      "https://cdn.prd2026.www.mec-h.com/bkn_img/madori/D34/H00907000066.jpg",
    ]);
  });
});
