import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter, { nextDataProps } from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.livable.co.jp";
const detail = (id: string) =>
  NormalizedListing.parse(
    adapter.normalize(adapter.parseDetail(fixture(`detail-${id}.json`), `${BASE}/chintai/${id}/`)),
  );

describe("livable queries", () => {
  it("区・町ごとに所在地順の一覧URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(6);
    expect(urls).toContain(`${BASE}/chintai/tokyo/a13103/?sort=address`);
    expect(urls).toContain(`${BASE}/chintai/tokyo/t13102003/?sort=address`); // 勝どき
    expect(urls).toContain(`${BASE}/chintai/tokyo/t13108030/?sort=address`); // 豊洲
  });
});

describe("livable nextDataProps", () => {
  it("HTML の __NEXT_DATA__ から pageProps を取り出す", () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"a":1}}}</script></html>`;
    expect(nextDataProps(html)).toEqual({ a: 1 });
  });

  it("__NEXT_DATA__ が無ければ例外（ブロックページ等を0件と取り違えない）", () => {
    expect(() => nextDataProps("<html><body>Access Denied</body></html>")).toThrow(/__NEXT_DATA__/);
  });
});

describe("livable parseList", () => {
  it("物件番号・詳細URL・賃料・総件数・次ページを取る", () => {
    const r = adapter.parseList(
      fixture("list-minato-1.json"),
      `${BASE}/chintai/tokyo/a13103/?sort=address`,
    );
    expect(r.items).toHaveLength(30);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "L132609088",
      detailUrl: `${BASE}/chintai/L132609088/`,
      price: 380_000,
    });
    expect(r.totalCount).toBe(193);
    expect(r.nextPageUrl).toBe(`${BASE}/chintai/tokyo/a13103/?sort=address&page=2`);
  });

  it("最終ページ（193件の7ページ目）で止まる", () => {
    const r = adapter.parseList(
      fixture("list-minato-7.json"),
      `${BASE}/chintai/tokyo/a13103/?sort=address&page=7`,
    );
    expect(r.items).toHaveLength(13);
    expect(r.nextPageUrl).toBeNull();
  });

  it('総件数の前後の空白を吸収する（勝どき " 12"）', () => {
    const r = adapter.parseList(
      fixture("list-kachidoki-1.json"),
      `${BASE}/chintai/tokyo/t13102003/?sort=address`,
    );
    expect(r.items).toHaveLength(12);
    expect(r.totalCount).toBe(12);
    expect(r.nextPageUrl).toBeNull();
  });
});

describe("livable normalize", () => {
  it("詳細を NormalizedListing に正規化する", () => {
    expect(detail("L132603329")).toMatchSnapshot();
  });

  it("「38階建ての19階部分」「1ヶ月 / 1ヶ月」、管理費の表示が無い物件は null", () => {
    expect(detail("L132609088")).toMatchObject({
      title: "シティタワー麻布十番",
      price: 380_000,
      managementFee: null,
      deposit: 380_000,
      keyMoney: 380_000,
      layout: "1LDK",
      areaSqm: 45.49,
      floor: 19,
      totalFloors: 38,
      structure: "RC",
      direction: "南東",
      transactionMode: "brokerage",
    });
  });

  it("管理費があれば円で入る", () => {
    expect(detail("L132603329")).toMatchObject({ price: 215_000, managementFee: 15_000 });
  });

  it("写真は画像プロキシを外した元画像のURL", () => {
    const n = detail("L132609088");
    expect(n.imageUrls).toHaveLength(24);
    expect(n.imageUrls[0]).toMatch(
      /^https:\/\/www\.livable\.co\.jp\/rent_home_image\/photo1\/L132609088\.jpg/,
    );
  });

  it("掲載終了の詳細は例外にする", () => {
    expect(() =>
      adapter.parseDetail(JSON.stringify({ isExpired: true }), `${BASE}/chintai/L1/`),
    ).toThrow(/掲載終了/);
  });
});
