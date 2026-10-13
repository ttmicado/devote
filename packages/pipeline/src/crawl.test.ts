import type { CrawlResult } from "@devote/scraper";
import { describe, expect, it } from "vitest";
import { summarizeCrawl } from "./crawl.js";

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
