import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import type { FetchContext } from "../../adapter.js";
import {
  parseDepositLike,
  parseFloorLabel,
  parseMainStructure,
  parseTotalFloors,
  splitFeeLine,
} from "./helpers.js";
import adapter from "./index.js";
import { extractBuildingUrls } from "./sumitomo.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://residence.sumitomo-latour.jp";

const detail = (id: string, path: string) =>
  adapter.normalize(adapter.parseDetail(fixture(`detail-${id}.html`), `${BASE}${path}`));

describe("sumitomo-residence 一覧", () => {
  it("エリアの建物一覧から空室のある建物だけを拾う（公開空室0室は除く）", () => {
    const urls = extractBuildingUrls(fixture("index-minato.html"), `${BASE}/buildlist/minato/`, []);
    expect(urls).toHaveLength(9);
    expect(urls[0]).toBe(`${BASE}/buildlist/minato/platine-tamachi/unit_empty/`);
    expect(urls.some((u) => u.includes("shibakoen-residence"))).toBe(false);
    expect(urls.every((u) => u.startsWith(`${BASE}/buildlist/minato/`))).toBe(true);
  });

  it("束ねた空室一覧から部屋単位の ID・詳細URL・賃料・総件数を取る", () => {
    const r = adapter.parseList(fixture("list-shinagawa.html"), `${BASE}/buildlist/shinagawa/`);
    expect(r.items).toHaveLength(14);
    expect(r.totalCount).toBe(14);
    expect(r.nextPageUrl).toBeNull();
    expect(new Set(r.items.map((i) => i.sourceListingId)).size).toBe(14);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "10199",
      detailUrl: `${BASE}/buildlist/shinagawa/osaki-station-residence/10199/`,
      price: 519_000,
    });
  });
});

describe("sumitomo-residence normalize", () => {
  it("部屋ページ＋建物概要を NormalizedListing に正規化する", () => {
    const n = detail("10199", "/buildlist/shinagawa/osaki-station-residence/10199/");
    expect(NormalizedListing.parse(n)).toBeTruthy();
    expect(n).toMatchSnapshot();
  });

  it("共益費・礼金ありの部屋、写真・外観・間取り図の絶対URL", () => {
    const n = detail("3236", "/buildlist/minato/platine-tamachi/3236/");
    expect(n).toMatchObject({
      price: 334_000,
      managementFee: 15_000,
      deposit: 668_000,
      keyMoney: 334_000,
      layout: "2LDK",
      areaSqm: 70.36,
      floor: 6,
      totalFloors: 23,
      structure: "SRC",
      builtYearMonth: "1991-01",
      address: { prefecture: "東京都", city: "港区", town: "芝浦" },
    });
    expect(n.imageUrls?.[0]).toBe(`${BASE}/bldg/imgfile.php?id1=28164&id2=D&id3=2LDK&id4=3236`);
    expect(n.imageUrls).toContain(`${BASE}/bldg/28164/unit/D-R3/photo/1.jpg`);
    expect(n.imageUrls).toContain(`${BASE}/bldg/28164/img/top/1.jpg`);
    expect(n.features).toContain("delivery_box");
  });

  it("室内写真が無い部屋でも間取り図と外観は取れる", () => {
    const n = detail("6625", "/buildlist/shinagawa/osakigarden-residence/6625/");
    expect(n).toMatchObject({ layout: "1K", areaSqm: 25.15, floor: 5, totalFloors: 23 });
    expect(n.imageUrls?.length).toBeGreaterThan(1);
  });

  it("賃料が数値でない部屋は throw する", () => {
    const raw = adapter.parseDetail(
      fixture("detail-3236.html"),
      `${BASE}/buildlist/minato/platine-tamachi/3236/`,
    );
    expect(() =>
      adapter.normalize({ ...raw, fields: { ...raw.fields, 賃料: "お問い合わせ" } }),
    ).toThrow(/賃料/);
  });
});

describe("sumitomo-residence fetchDetail", () => {
  it("部屋ページと建物概要を束ね、建物概要はキャッシュする", async () => {
    const calls: string[] = [];
    const ctx: FetchContext = {
      async get(url) {
        calls.push(url);
        return {
          status: 200,
          body: `<html><body><main><h1><span class="ja">X</span></h1></main></body></html>`,
          url,
        };
      },
    };
    const item = (id: string) => ({
      sourceListingId: id,
      detailUrl: `${BASE}/buildlist/minato/platine-tamachi/${id}/`,
      listHash: "",
    });
    const html = await adapter.fetchDetail?.(ctx, item("1"));
    await adapter.fetchDetail?.(ctx, item("2"));
    expect(html).toContain('data-kind="building"');
    expect(calls).toEqual([
      `${BASE}/buildlist/minato/platine-tamachi/1/`,
      `${BASE}/buildlist/minato/platine-tamachi/`,
      `${BASE}/buildlist/minato/platine-tamachi/2/`,
    ]);
  });
});

describe("表記揺れ", () => {
  it.each([
    ["36F", 36],
    ["３６Ｆ", 36],
    ["12階", 12],
    ["B1F", -1],
    ["地下2階", -2],
    ["-", null],
  ])("階数 %s → %s", (input, expected) => {
    expect(parseFloorLabel(input)).toBe(expected);
  });

  it("構造は「一部〜造」ではなく主構造を取る", () => {
    expect(parseMainStructure("鉄骨造、一部鉄筋コンクリート造　地上43階　地下2階")).toBe("S");
    expect(parseMainStructure("鉄筋コンクリート造　一部　鉄骨造、鉄骨鉄筋コンクリート造")).toBe(
      "RC",
    );
    expect(parseMainStructure("鉄骨鉄筋コンクリート造　地上23階/地下1階")).toBe("SRC");
    expect(parseTotalFloors("鉄骨鉄筋コンクリート造　地上23階/地下1階")).toBe(23);
    expect(parseTotalFloors("ＲＣ造　１０階建")).toBe(10);
  });

  it("1行に詰め込まれた敷金・礼金・共益費を分解する", () => {
    expect(splitFeeLine("敷金2ヶ月／礼金1ヶ月／共益費15,000円")).toEqual({
      敷金: "2ヶ月",
      礼金: "1ヶ月",
      共益費: "15,000円",
    });
    expect(parseDepositLike("0", 300_000)).toBe(0);
    expect(parseDepositLike("1.5ヵ月", 200_000)).toBe(300_000);
    expect(parseDepositLike("なし", 200_000)).toBe(0);
  });
});
