import type { CrawlResult } from "@devote/scraper";
import { describe, expect, it } from "vitest";
import { crawlOrder, sourceDeadline, summarizeCrawl } from "./crawl.js";

const base: CrawlResult = {
  listings: [],
  errors: [],
  listCompleted: true,
  countMismatch: false,
  seenIds: [],
  listHashes: {},
  deferred: 0,
  listRequests: 1,
  detailRequests: 0,
  warnings: [],
};

describe("summarizeCrawl（バッチのログに出す件数）", () => {
  it("変化の無い回は unchanged に計上され、inArea / newCount が 0 でも異常でないと分かる", () => {
    expect(summarizeCrawl({ ...base, seenIds: ["1", "2", "3"] })).toEqual({
      seen: 3,
      unchanged: 3,
      detailRequests: 0,
      fetched: 0,
      deferred: 0,
      listCompleted: true,
    });
  });

  it("詳細を取得した件数・次回に回した件数を分けて出す", () => {
    const ids = Array.from({ length: 10 }, (_, i) => String(i));
    expect(summarizeCrawl({ ...base, seenIds: ids, detailRequests: 4, deferred: 5 })).toMatchObject(
      { seen: 10, unchanged: 1, detailRequests: 4, deferred: 5 },
    );
  });
});

describe("crawlOrder（巡回の順番）", () => {
  const a = (id: string, requiresLogin = false) => ({ meta: { id, requiresLogin } });
  it("会員サイトが先。公開サイトは最後に成功してから長いもの（未成功を含む）から", () => {
    const last = new Map([
      ["old", new Date("2026-10-15T00:00:00Z")],
      ["new", new Date("2026-10-15T12:00:00Z")],
      ["reins", new Date("2026-10-15T12:00:00Z")],
    ]);
    const order = crawlOrder([a("new"), a("old"), a("never"), a("reins", true)], last);
    expect(order.map((x) => x.meta.id)).toEqual(["reins", "never", "old", "new"]);
  });
});

describe("sourceDeadline（1ソースの締め切り）", () => {
  const t0 = Date.UTC(2026, 9, 16, 0, 0);
  it("ソースごとの上限時間と、全体の締め切り−取り込みの余裕のうち早い方", () => {
    expect(sourceDeadline(t0, undefined, 15)).toBe(t0 + 15 * 60_000);
    expect(sourceDeadline(t0, t0 + 60 * 60_000, 15)).toBe(t0 + 15 * 60_000);
    expect(sourceDeadline(t0, t0 + 10 * 60_000, 15)).toBe(t0 + 7 * 60_000);
  });
});
