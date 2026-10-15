import { describe, expect, it, vi } from "vitest";
import { createHttpFetcher, decodeBody } from "./fetcher.js";

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

describe("decodeBody", () => {
  // 「あ」の Shift_JIS は 0x82 0xA0
  const sjis = (html: string) =>
    new Uint8Array([...Buffer.from(html, "latin1"), 0x82, 0xa0]).buffer as ArrayBuffer;

  it("Content-Type の charset で復号する", () => {
    expect(decodeBody(sjis("<p>"), "text/html; charset=Shift_JIS")).toBe("<p>あ");
  });

  it("ヘッダに無ければ <meta charset> を見る", () => {
    const html = '<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS" />';
    expect(decodeBody(sjis(html), "text/html")).toBe(`${html}あ`);
  });

  it("指定が無ければ UTF-8", () => {
    expect(decodeBody(new TextEncoder().encode("あ").buffer as ArrayBuffer, null)).toBe("あ");
  });
});
