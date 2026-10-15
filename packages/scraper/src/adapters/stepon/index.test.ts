import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.stepon.co.jp";
const detail = (id: string) =>
  NormalizedListing.parse(
    adapter.normalize(
      adapter.parseDetail(fixture(`detail-${id}.html`), `${BASE}/chintai/detail/${id}/`),
    ),
  );

describe("stepon queries", () => {
  it("区ごとのマンション検索と、戸建てをまとめた1検索を作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(7);
    expect(urls[0]).toBe(
      `${BASE}/chintai/search/list/?type=mansion&prefCd=13&isDesignated=on&searchType=area&prefCityCd=13_103&limit=50`,
    );
    // 中央区は勝どきだけに絞る（フラグメントはサーバーに送られない）
    expect(urls).toContain(
      `${BASE}/chintai/search/list/?type=mansion&prefCd=13&isDesignated=on&searchType=area&prefCityCd=13_102&limit=50#towns=%E5%8B%9D%E3%81%A9%E3%81%8D`,
    );
    expect(urls.at(-1)).toBe(
      `${BASE}/chintai/search/list/?type=kodate&prefCd=13&isDesignated=on&searchType=area&prefCityCd=13_103&prefCityCd=13_113&prefCityCd=13_101&prefCityCd=13_109&limit=50`,
    );
  });
});

describe("stepon parseList", () => {
  it("部屋ごとに物件番号・詳細URL・賃料・総件数を取る", () => {
    const r = adapter.parseList(
      fixture("list-minato-1.html"),
      `${BASE}/chintai/search/list/?limit=50`,
    );
    expect(r.items).toHaveLength(43);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "162UA980",
      detailUrl: `${BASE}/chintai/detail/162UA980/`,
      price: 380_000,
    });
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(43);
    expect(r.totalCount).toBe(43);
    expect(r.nextPageUrl).toBeNull();
  });

  it("町名で絞る一覧は対象の町だけ残し、次ページにも絞り込みを引き継ぐ", () => {
    const url = adapter.buildListUrl(
      adapter.queries().find((q) => q.key === "mansion-chuo-kachidoki") ?? { key: "", params: {} },
    );
    const r = adapter.parseList(fixture("list-chuo-1.html"), url);
    // 1ページ目（50件）は月島・晴海・築地などで、勝どきは無い
    expect(r.items).toHaveLength(0);
    expect(r.totalCount).toBeNull();
    expect(r.nextPageUrl).toBe(
      `${BASE}/chintai/search/list/?pageNo=2&type=mansion&prefCd=13&isDesignated=on&searchType=area&prefCityCd=13_102&limit=50#towns=%E5%8B%9D%E3%81%A9%E3%81%8D`,
    );
  });

  it("listHash は同じ内容なら安定している", () => {
    const html = fixture("list-kodate-1.html");
    const a = adapter.parseList(html, `${BASE}/chintai/search/list/`);
    const b = adapter.parseList(html, `${BASE}/chintai/search/list/`);
    expect(a.items).toHaveLength(5);
    expect(a.items.map((i) => i.listHash)).toEqual(b.items.map((i) => i.listHash));
  });
});

describe("stepon normalize", () => {
  it("部屋詳細を NormalizedListing に正規化する", () => {
    expect(detail("162UA980")).toMatchSnapshot();
  });

  it("「39階部分／地上42階地下2階建て・ＲＣ造」「760,000円／2ヶ月」を吸収する", () => {
    expect(detail("162UA980")).toMatchObject({
      title: "ワールドシティタワーズキャピタルタワー",
      price: 380_000,
      managementFee: 18_000,
      deposit: 760_000,
      keyMoney: 380_000,
      layout: "1LDK",
      areaSqm: 60.34,
      floor: 39,
      totalFloors: 42,
      structure: "RC",
      direction: "北",
      propertyType: "mansion",
      transactionMode: "brokerage",
    });
  });

  it("戸建ては所在階なし・木造・2SLDK（※Ｓの注記を除く）", () => {
    expect(detail("162UC807")).toMatchObject({
      title: "渋谷区代々木5丁目戸建",
      propertyType: "house",
      layout: "2SLDK",
      floor: null,
      totalFloors: 3,
      structure: "W",
      managementFee: 0,
      keyMoney: 0,
    });
  });

  it("写真はこの物件の拡大画像だけ（おすすめ物件の写真は含めない）", () => {
    const n = detail("162UA980");
    expect(n.imageUrls).toHaveLength(17);
    expect(n.imageUrls[0]).toBe(`${BASE}/pub/img/retail/11462U/162UA980/162UA980_1_l.jpg`);
    expect(n.imageUrls).toContain(`${BASE}/pub/img/retail/11462U/162UA980/162UA980_madori_l.jpg`);
    expect(
      n.imageUrls.every((u) => u.includes("/162UA980/162UA980_") && u.endsWith("_l.jpg")),
    ).toBe(true);
  });
});
