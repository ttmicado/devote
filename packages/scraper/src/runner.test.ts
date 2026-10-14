import { describe, expect, it } from "vitest";
import { defineAdapter } from "./adapter.js";
import { crawlSource } from "./runner.js";

/** 一覧2ページ・各1件の合成アダプター。呼ばれた順番を記録する */
function fakeAdapter(flags: { detailsAfterEachListPage?: boolean; incrementalList?: boolean }) {
  const calls: string[] = [];
  const adapter = defineAdapter({
    meta: {
      id: "fake",
      displayName: "fake",
      kind: "b2b",
      fetchMode: { list: "browser", detail: "browser" },
      requiresLogin: false,
      rateLimit: { minIntervalMs: 0, maxConcurrency: 1 },
      schedule: { listCron: "* * * * *", detailRevisitHours: 1 },
      parserVersion: "1",
      ...flags,
    },
    queries: () => [{ key: "q", params: {} }],
    buildListUrl: () => "fake://list?page=1",
    async fetchList(_ctx, url) {
      calls.push(`list:${url}`);
      return url;
    },
    async fetchDetail(_ctx, item) {
      calls.push(`detail:${item.sourceListingId}`);
      return item.sourceListingId;
    },
    parseList: (body) => {
      const page = Number(new URL(body).searchParams.get("page"));
      return {
        items: [{ sourceListingId: `id${page}`, detailUrl: `fake://d/${page}`, listHash: "h" }],
        nextPageUrl: page < 2 ? "fake://list?page=2" : null,
        totalCount: null,
      };
    },
    parseDetail: (html, url) => ({ sourceListingId: html, url, fields: {}, imageUrls: [] }),
    normalize: () => {
      throw new Error("テストでは正規化しない");
    },
  });
  return { adapter, calls };
}

const ctx = { get: async () => ({ status: 200, body: "", url: "" }) };

describe("crawlSource", () => {
  it("既定: 一覧を全ページ取ってから詳細", async () => {
    const { adapter, calls } = fakeAdapter({});
    await crawlSource(adapter, ctx);
    expect(calls).toEqual([
      "list:fake://list?page=1",
      "list:fake://list?page=2",
      "detail:id1",
      "detail:id2",
    ]);
  });

  it("detailsAfterEachListPage: 一覧1ページごとにそのページの詳細を取る（レインズ）", async () => {
    const { adapter, calls } = fakeAdapter({ detailsAfterEachListPage: true });
    const r = await crawlSource(adapter, ctx);
    expect(calls).toEqual([
      "list:fake://list?page=1",
      "detail:id1",
      "list:fake://list?page=2",
      "detail:id2",
    ]);
    expect(r.detailRequests).toBe(2);
  });

  it("incrementalList: 結果に partialList を付ける（掲載終了の判定をさせない）", async () => {
    expect(
      (await crawlSource(fakeAdapter({ incrementalList: true }).adapter, ctx)).partialList,
    ).toBe(true);
    expect((await crawlSource(fakeAdapter({}).adapter, ctx)).partialList).toBe(false);
  });
});
