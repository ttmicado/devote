import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import type { FetchContext } from "../../adapter.js";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.mitsui-chintai.co.jp";
const detail = (id: string) =>
  NormalizedListing.parse(
    adapter.normalize(
      adapter.parseDetail(
        fixture(`detail-${id}.html`),
        `${BASE}/rf/tatemono/${id.replace("-", "/")}`,
      ),
    ),
  );

describe("mitsui-chintai queries", () => {
  it("区と「月島・勝どき・豊洲」エリアの一覧URLを作る（エリアは勝どき・晴海・豊洲に絞る）", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(5);
    expect(urls[0]).toBe(`${BASE}/rf/result?ku=(1,22)&get=ward`);
    expect(urls.at(-1)).toBe(
      `${BASE}/rf/result?are=10&get=area#towns=%E5%8B%9D%E3%81%A9%E3%81%8D,%E6%99%B4%E6%B5%B7,%E8%B1%8A%E6%B4%B2`,
    );
  });
});

describe("mitsui-chintai parseList", () => {
  it("建物ごとの空室行から部屋ID・詳細URL・賃料・次ページ・対象お部屋数を取る", () => {
    const r = adapter.parseList(
      fixture("list-minato-1.html"),
      `${BASE}/rf/result?ku=(1,22)&get=ward`,
    );
    expect(r.items).toHaveLength(88);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "6412-201",
      detailUrl: `${BASE}/rf/tatemono/6412/201`,
      price: 112_000,
    });
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(88);
    expect(r.nextPageUrl).toBe(`${BASE}/rf/result?ku=(1,22)&get=ward&page=2`);
    expect(r.totalCount).toBe(723);
  });

  it("最終ページでは次ページへ進まない", () => {
    const r = adapter.parseList(
      fixture("list-minato-15.html"),
      `${BASE}/rf/result?ku=(1,22)&get=ward&page=15`,
    );
    expect(r.items).toHaveLength(9);
    expect(r.nextPageUrl).toBeNull();
  });

  it("エリア検索は勝どき・晴海・豊洲の建物だけ残し、次ページにも絞り込みを引き継ぐ", () => {
    const url = adapter.buildListUrl(adapter.queries().at(-1) ?? { key: "", params: {} });
    const r = adapter.parseList(fixture("list-area10-1.html"), url);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThan(102); // 月島・晴海などを除く
    expect(r.totalCount).toBeNull();
    expect(r.nextPageUrl).toBe(`${BASE}/rf/result?are=10&get=area&page=2${new URL(url).hash}`);
  });
});

describe("mitsui-chintai fetchDetail", () => {
  it("詳細HTMLの末尾に写真のJSON（/rf/photo/{建物}/{部屋}）を付ける", async () => {
    const urls: string[] = [];
    const ctx: FetchContext = {
      async get(url) {
        urls.push(url);
        const body = url.includes("/rf/photo/")
          ? '[{"ROOM_NO":99999,"filename":"https://x/a.jpg"}]'
          : "<html></html>";
        return { status: 200, body, url };
      },
    };
    const html = await adapter.fetchDetail?.(ctx, {
      sourceListingId: "6412-203",
      detailUrl: `${BASE}/rf/tatemono/6412/203`,
      listHash: "",
    });
    expect(urls).toEqual([`${BASE}/rf/tatemono/6412/203`, `${BASE}/rf/photo/6412/203`]);
    expect(html).toContain('<script type="application/json" id="devote-photos">[{"ROOM_NO":99999');
  });
});

describe("mitsui-chintai normalize", () => {
  it("部屋詳細を NormalizedListing に正規化する", () => {
    expect(detail("7638-914")).toMatchSnapshot();
  });

  it("「112,000円 / 0円」「1.0ヶ月 / 1.8ヶ月」「1K / 26.88㎡」「地上13階建」を吸収する", () => {
    expect(detail("6412-203")).toMatchObject({
      title: "協和高輪マンション",
      price: 112_000,
      managementFee: 0,
      deposit: 112_000,
      keyMoney: 201_600,
      layout: "1K",
      areaSqm: 26.88,
      builtYearMonth: "2006-08",
      floor: 2,
      totalFloors: 13,
      structure: "SRC",
      direction: "東",
    });
  });

  it("交通は全駅を「路線「駅」駅 徒歩N分」に組み立てる（事業者名は落とす）", () => {
    expect(detail("6412-203").stations).toEqual([
      { line: "都営浅草線", station: "泉岳寺", walkMinutes: 2, busMinutes: null },
      { line: "山手線", station: "高輪ゲートウェイ", walkMinutes: 6, busMinutes: null },
      { line: "京浜急行線", station: "品川", walkMinutes: 10, busMinutes: null },
      { line: "南北線", station: "白金台", walkMinutes: 21, busMinutes: null },
      { line: "南北線", station: "白金高輪", walkMinutes: 14, busMinutes: null },
    ]);
  });

  it("写真は建物共通（ROOM_NO=99999）とこの部屋の分", () => {
    const n = detail("6884-901");
    expect(n.imageUrls).toHaveLength(14);
    expect(n.imageUrls[0]).toBe(
      "https://mfhl.mitsui-chintai.co.jp/websearch/image/06884/06884a.jpg",
    );
    expect(n.imageUrls).toContain(
      "https://mfhl.mitsui-chintai.co.jp/websearch/image/06884/0688400901c.jpg",
    );
  });

  it("アピールポイントの「ペット可」と設備の「ピアノ可」をタグにする", () => {
    expect(detail("6884-901").features).toEqual(
      expect.arrayContaining(["pet_ok", "instrument_ok"]),
    );
  });
});
