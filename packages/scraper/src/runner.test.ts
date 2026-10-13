import { describe, expect, it } from "vitest";
import { defineAdapter, type FetchContext, type SiteAdapter } from "./adapter.js";
import { crawlSource } from "./runner.js";

/**
 * テスト用アダプター。一覧は "ids=a,b,c" 形式の本文、詳細は "rent=<円>" 形式の本文。
 * 取得は routes（URL → { status, body }）から返す。
 */
function testAdapter(queries: string[]): SiteAdapter {
  return defineAdapter({
    meta: {
      id: "test",
      displayName: "test",
      kind: "realtor_own",
      fetchMode: { list: "http", detail: "http" },
      requiresLogin: false,
      rateLimit: { minIntervalMs: 0, maxConcurrency: 1 },
      schedule: { listCron: "", detailRevisitHours: 24 },
      parserVersion: "1",
    },
    queries: () => queries.map((key) => ({ key, params: {} })),
    buildListUrl: (q) => `https://t.example/list/${q.key}`,
    parseList(body) {
      const ids = (body.match(/ids=([\w,]*)/)?.[1] ?? "").split(",").filter(Boolean);
      return {
        items: ids.map((id) => ({
          sourceListingId: id,
          detailUrl: `https://t.example/d/${id}`,
          listHash: `h-${id}`,
        })),
        nextPageUrl: null,
        totalCount: null,
      };
    },
    parseDetail(body, url) {
      const id = url.split("/").pop() as string;
      const rent = body.match(/rent=(\d+)/)?.[1];
      if (!rent) throw new Error(`賃料がない: ${url}`);
      return { sourceListingId: id, url, fields: { rent }, imageUrls: [] };
    },
    normalize(raw) {
      return {
        source: "test",
        sourceListingId: raw.sourceListingId,
        url: raw.url,
        dealType: "rent",
        title: null,
        address: { prefecture: "東京都", city: "港区", town: "六本木", raw: "東京都港区六本木" },
        stations: [],
        price: Number(raw.fields.rent),
        managementFee: null,
        deposit: null,
        keyMoney: null,
        layout: null,
        areaSqm: null,
        builtYearMonth: null,
        floor: null,
        totalFloors: null,
        structure: null,
        direction: null,
        features: [],
        transactionMode: "unknown",
        adAllowed: null,
        agencyName: null,
        imageUrls: [],
        sourceUpdatedAt: null,
        propertyType: "mansion",
        extra: {},
      };
    },
  });
}

function routes(map: Record<string, { status?: number; body: string }>): FetchContext & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      const r = map[url];
      if (!r) return { status: 404, body: "", url };
      return { status: r.status ?? 200, body: r.body, url };
    },
  };
}

const CHALLENGE =
  '<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/x"></script></body></html>';

describe("crawlSource の警告（黙って0件にしない）", () => {
  it("0件のクエリと、全体で0件を警告する", async () => {
    const ctx = routes({
      "https://t.example/list/a": { body: "ids=" },
      "https://t.example/list/b": { body: "ids=" },
    });
    const r = await crawlSource(testAdapter(["a", "b"]), ctx);
    expect(r.seenIds).toEqual([]);
    expect(r.warnings).toEqual([
      "一覧が0件のクエリ: a, b",
      "一覧が全体で0件（ブロック・構造変化・検索条件の誤りの可能性）",
    ]);
  });

  it("一部のクエリだけ0件なら、そのクエリ名だけ警告する", async () => {
    const ctx = routes({
      "https://t.example/list/a": { body: "ids=1" },
      "https://t.example/list/b": { body: "ids=" },
      "https://t.example/d/1": { body: "rent=100000" },
    });
    const r = await crawlSource(testAdapter(["a", "b"]), ctx);
    expect(r.listings).toHaveLength(1);
    expect(r.listCompleted).toBe(true);
    expect(r.warnings).toEqual(["一覧が0件のクエリ: b"]);
  });

  it("一覧が 200 のチャレンジページなら警告し、一覧は不完全扱い（掲載終了判定をさせない）", async () => {
    const ctx = routes({
      "https://t.example/list/a": { body: "ids=1" },
      "https://t.example/list/b": { body: CHALLENGE },
      "https://t.example/d/1": { body: "rent=100000" },
    });
    const r = await crawlSource(testAdapter(["a", "b"]), ctx);
    expect(r.listCompleted).toBe(false);
    expect(r.seenIds).toEqual(["1"]);
    expect(r.warnings[0]).toMatch(
      /^一覧がブロック・チャレンジ・エラーの可能性（Cloudflare のチャレンジ）: https:\/\/t\.example\/list\/b Just a moment/,
    );
  });

  it("一覧が HTTP 403 / 404 なら警告し、一覧は不完全扱い", async () => {
    const ctx = routes({ "https://t.example/list/a": { status: 403, body: "Forbidden" } });
    const r = await crawlSource(testAdapter(["a", "b"]), ctx);
    expect(r.listCompleted).toBe(false);
    expect(r.warnings.filter((w) => w.startsWith("一覧がブロック"))).toHaveLength(2);
    expect(r.warnings[0]).toContain("HTTP 403");
    expect(r.warnings[1]).toContain("HTTP 404");
  });

  it("詳細の HTTP エラーはパースエラーではなく HTTP ステータスとして記録する", async () => {
    const ctx = routes({ "https://t.example/list/a": { body: "ids=1" } });
    const r = await crawlSource(testAdapter(["a"]), ctx);
    expect(r.errors.map((e) => e.error)).toEqual(["HTTP 404: https://t.example/d/1"]);
  });

  it("詳細でブロックが3回続いたら打ち切り、残りは次回に回す", async () => {
    const ids = ["1", "2", "3", "4", "5"];
    const ctx = routes({
      "https://t.example/list/a": { body: `ids=${ids.join(",")}` },
      ...Object.fromEntries(ids.map((id) => [`https://t.example/d/${id}`, { body: CHALLENGE }])),
    });
    const r = await crawlSource(testAdapter(["a"]), ctx);
    expect(r.detailRequests).toBe(3);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]?.error).toMatch(/^ブロック・チャレンジの可能性（Cloudflare のチャレンジ）/);
    expect(r.deferred).toBe(2);
    expect(
      r.warnings.some((w) => w.startsWith("詳細でブロック・チャレンジが3回続いたため打ち切り")),
    ).toBe(true);
  });
});

describe("crawlSource の詳細件数上限（maxDetails）", () => {
  it("上限を超えた分は deferred になり、次回（listHash 既知の分を除いて）続きから取得する", async () => {
    const ids = ["1", "2", "3", "4", "5"];
    const ctx = routes({
      "https://t.example/list/a": { body: `ids=${ids.join(",")}` },
      ...Object.fromEntries(ids.map((id) => [`https://t.example/d/${id}`, { body: "rent=1" }])),
    });
    const adapter = testAdapter(["a"]);
    const first = await crawlSource(adapter, ctx, { maxDetails: 3 });
    expect(first.listings.map((l) => l.sourceListingId)).toEqual(["1", "2", "3"]);
    expect(first.deferred).toBe(2);

    // パイプラインは取り込んだ物件の listHash を保存し、次回 knownListHashes として渡す
    const known = new Map(first.listings.map((l) => [l.sourceListingId, `h-${l.sourceListingId}`]));
    const second = await crawlSource(adapter, ctx, { maxDetails: 3, knownListHashes: known });
    expect(second.listings.map((l) => l.sourceListingId)).toEqual(["4", "5"]);
    expect(second.deferred).toBe(0);

    // 3回目は変化なし → 詳細は取得しない（inArea / newCount が 0 になるのはこの状態）
    for (const l of second.listings) known.set(l.sourceListingId, `h-${l.sourceListingId}`);
    const third = await crawlSource(adapter, ctx, { maxDetails: 3, knownListHashes: known });
    expect(third.detailRequests).toBe(0);
    expect(third.listings).toEqual([]);
    expect(third.seenIds).toHaveLength(5);
    expect(third.warnings).toEqual([]);
  });
});
