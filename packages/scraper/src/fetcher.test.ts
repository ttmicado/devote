import { describe, expect, it, vi } from "vitest";
import { createHttpFetcher } from "./fetcher.js";

describe("createHttpFetcher", () => {
  it("5xx はリトライし、404 はそのまま返す", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
    const responses = [new Response("", { status: 503 }), new Response("ok", { status: 200 })];
    const fetchImpl = vi.fn(async () => responses.shift() ?? new Response("", { status: 404 }));
    const ctx = createHttpFetcher(
      { rateLimit: { minIntervalMs: 0, maxConcurrency: 1 } },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    await expect(ctx.get("https://example.com/a")).resolves.toMatchObject({
      status: 200,
      body: "ok",
    });
    await expect(ctx.get("https://example.com/b")).resolves.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
