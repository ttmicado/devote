import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crawlSource } from "../../runner.js";
import { fixtureFetcher } from "../../testing.js";
import adapter from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://sample-realtor.example";

describe("sample-realtor parseList", () => {
  it("一覧から ID・詳細URL・次ページを取る", () => {
    const r = adapter.parseList(fixture("list-1.html"), `${BASE}/rent/list?area=meguro`);
    expect(r.items.map((i) => i.sourceListingId)).toEqual(["R-10001", "R-10002"]);
    expect(r.items[1]?.price).toBe(98_000);
    expect(r.nextPageUrl).toBe(`${BASE}/rent/list?area=meguro&page=2`);
    expect(r.totalCount).toBe(3);
  });
});

describe("sample-realtor normalize", () => {
  it("詳細ページを NormalizedListing に正規化する", () => {
    const url = `${BASE}/rent/R-10001`;
    const n = adapter.normalize(adapter.parseDetail(fixture("detail-R-10001.html"), url));
    expect(n).toMatchSnapshot();
  });

  it("全角・和暦・+S 表記を吸収する", () => {
    const n2 = adapter.normalize(
      adapter.parseDetail(fixture("detail-R-10002.html"), `${BASE}/rent/R-10002`),
    );
    expect(n2).toMatchObject({ price: 98_000, layout: "1K", deposit: 98_000, keyMoney: 98_000 });
    // 「ペット相談」は要相談タグ
    expect(n2.features).toContain("pet_negotiable");

    const n3 = adapter.normalize(
      adapter.parseDetail(fixture("detail-R-10003.html"), `${BASE}/rent/R-10003`),
    );
    expect(n3).toMatchObject({ layout: "2SLDK", areaSqm: 69.5, builtYearMonth: "2020-11" });
  });
});

describe("crawlSource", () => {
  const ctx = fixtureFetcher(dir, {
    [`${BASE}/rent/list?area=meguro`]: "list-1.html",
    [`${BASE}/rent/list?area=meguro&page=2`]: "list-2.html",
    [`${BASE}/rent/R-10001`]: "detail-R-10001.html",
    [`${BASE}/rent/R-10002`]: "detail-R-10002.html",
    [`${BASE}/rent/R-10003`]: "detail-R-10003.html",
  });

  it("一覧の全ページ → 詳細 → 正規化まで通る", async () => {
    const r = await crawlSource(adapter, ctx);
    expect(r.listings).toHaveLength(3);
    expect(r).toMatchObject({ errors: [], listCompleted: true, countMismatch: false });
  });

  it("listHash が既知と同じ物件は詳細取得を省略する", async () => {
    const first = adapter.parseList(fixture("list-1.html"), `${BASE}/rent/list?area=meguro`);
    const known = new Map(first.items.map((i) => [i.sourceListingId, i.listHash]));
    const r = await crawlSource(adapter, ctx, { knownListHashes: known });
    expect(r.listings.map((l) => l.sourceListingId)).toEqual(["R-10003"]);
    expect(r.seenIds).toHaveLength(3);
  });
});
