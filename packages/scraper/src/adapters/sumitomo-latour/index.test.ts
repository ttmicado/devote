import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { extractBuildingUrls } from "../sumitomo-residence/sumitomo.js";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.sumitomo-latour.jp";

const detail = (id: string, path: string) =>
  adapter.normalize(adapter.parseDetail(fixture(`detail-${id}.html`), `${BASE}${path}`));

describe("sumitomo-latour 一覧", () => {
  it("トップのラインナップから対象エリアの自サイトの建物だけを拾う", () => {
    const urls = extractBuildingUrls(fixture("index-top.html"), `${BASE}/`, [
      "minato_area",
      "shibuya_area",
      "chiyoda-bunkyo_area",
    ]);
    expect(urls).toHaveLength(18);
    expect(urls).toContain(`${BASE}/buildlist/minato_area/latour-mita/unit_empty/`);
    // 新宿・関西・札幌、別サイト（residence.sumitomo-latour.jp）の建物は含めない
    expect(urls.some((u) => /shinjuku|kansai|hokkaido/.test(u))).toBe(false);
    expect(urls.every((u) => u.startsWith(`${BASE}/`))).toBe(true);
  });

  it("束ねた空室一覧（空室なしの建物を含む）から部屋を取る", () => {
    const r = adapter.parseList(fixture("list-lineup.html"), `${BASE}/`);
    expect(r.items).toHaveLength(52);
    expect(r.totalCount).toBe(52);
    expect(r.nextPageUrl).toBeNull();
    expect(r.items.find((i) => i.sourceListingId === "1994")).toMatchObject({
      detailUrl: `${BASE}/buildlist/minato_area/latour-mita/1994/`,
      price: 440_000,
    });
  });
});

describe("sumitomo-latour normalize", () => {
  it("部屋ページ＋建物概要を NormalizedListing に正規化する", () => {
    const n = detail("1994", "/buildlist/minato_area/latour-mita/1994/");
    expect(NormalizedListing.parse(n)).toBeTruthy();
    expect(n).toMatchSnapshot();
  });

  it("鉄骨造（一部RC）・ワンルーム・36F 表記", () => {
    const n = detail("1994", "/buildlist/minato_area/latour-mita/1994/");
    expect(n).toMatchObject({
      layout: "1R",
      areaSqm: 55,
      floor: 36,
      totalFloors: 43,
      structure: "S",
      deposit: 1_320_000,
      keyMoney: 0,
      managementFee: 0,
    });
  });

  it("1階住戸・3LDK", () => {
    const n1 = detail("1518", "/buildlist/minato_area/izumigarden-residence/1518/");
    expect(n1).toMatchObject({ floor: 1, layout: "2LDK", price: 890_000, structure: "SRC" });
    const n2 = detail("1609", "/buildlist/minato_area/izumigarden-residence/1609/");
    expect(n2).toMatchObject({ floor: 13, layout: "3LDK", price: 1_490_000 });
    expect(n2.imageUrls?.every((u) => u.startsWith(`${BASE}/bldg/`))).toBe(true);
  });
});
