import { createHmac } from "node:crypto";
import type { NormalizedListing } from "@devote/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildEmail, buildLineMessages } from "./format";
import { verifyLineSignature } from "./line";

const listing = {
  title: "テストタワー <1204>",
  dealType: "rent",
  price: 320_000,
  managementFee: 20_000,
  address: { prefecture: "東京都", city: "港区", town: "六本木", raw: "" },
  stations: [{ line: null, station: "六本木", walkMinutes: 4, busMinutes: null }],
  layout: "2LDK",
  areaSqm: 70.2,
  imageUrls: ["http://insecure.example/a.jpg", "https://example.com/b.jpg"],
} as unknown as NormalizedListing;

const items = Array.from({ length: 15 }, (_, i) => ({
  propertyId: `p${i}`,
  listing,
  score: 90,
  reasons: i === 0 ? ["面積が0.5㎡不足"] : [],
}));

describe("buildLineMessages", () => {
  it("1メッセージのカルーセル（最大12枚）、https の画像だけ使う", () => {
    const [msg] = buildLineMessages(items, {
      appUrl: "https://app",
      notificationId: "n1",
    });
    const contents = (
      msg as { contents: { contents: { hero?: { url: string }; footer: unknown }[] } }
    ).contents.contents;
    // 物件11件＋「すべてのご提案を見る」
    expect(contents).toHaveLength(12);
    expect(contents[0]?.hero?.url).toBe("https://example.com/b.jpg");
    expect(JSON.stringify(contents[0]?.footer)).toContain("https://app/properties/p0?nid=n1");
    expect((msg as { altText: string }).altText).toBe("ご希望に適う物件が見つかりました（15件）");
  });
});

describe("buildEmail", () => {
  it("物件名をエスケープし、配信設定へのリンクを入れる", () => {
    const m = buildEmail(items.slice(0, 2), {
      appUrl: "https://app",
      notificationId: "n1",
      settingsUrl: "https://app/settings",
    });
    expect(m.subject).toBe("【Devote】ご希望に適う物件が2件見つかりました");
    expect(m.html).toContain("テストタワー &lt;1204&gt;");
    expect(m.html).toContain("https://app/settings");
    expect(m.text).toContain("総額／月 34万円");
  });
});

describe("verifyLineSignature", () => {
  afterEach(() => {
    delete process.env.LINE_CHANNEL_SECRET;
  });
  it("チャネルシークレットの HMAC-SHA256 と一致するときだけ true", () => {
    process.env.LINE_CHANNEL_SECRET = "secret";
    const body = '{"events":[]}';
    const sig = createHmac("sha256", "secret").update(body).digest("base64");
    expect(verifyLineSignature(body, sig)).toBe(true);
    expect(verifyLineSignature(body, "AAAA")).toBe(false);
    expect(verifyLineSignature(`${body} `, sig)).toBe(false);
  });
});

describe("適合度の表示", async () => {
  const { scoreText } = await import("./format");
  const item = { propertyId: "p", listing, score: 90, reasons: [] as string[] };
  it("100点、または soft 条件がないときは出さない", () => {
    expect(scoreText(item)).toBe("適合度 90");
    expect(scoreText({ ...item, score: 100 })).toBeNull();
    expect(scoreText({ ...item, showScore: false })).toBeNull();
  });
  it("出さないときは「ご希望をすべて満たしています」を添える", () => {
    const m = buildEmail([{ ...item, showScore: false }], {
      appUrl: "https://app",
      notificationId: "n1",
      settingsUrl: "https://app/settings",
    });
    expect(m.html).not.toContain("適合度");
    expect(m.html).toContain("ご希望をすべて満たしています");
  });
});

describe("メールのフッター", () => {
  it("配信停止リンクと送信者情報を入れる", () => {
    const m = buildEmail(items.slice(0, 1), {
      appUrl: "https://app",
      notificationId: "n1",
      settingsUrl: "https://app/settings",
      unsubscribeUrl: "https://app/api/unsubscribe?t=abc",
    });
    expect(m.html).toContain("https://app/api/unsubscribe?t=abc");
    expect(m.text).toContain("配信停止: https://app/api/unsubscribe?t=abc");
    expect(m.text).toContain("株式会社Devote");
    // 値のない項目（null）は出さない
    expect(m.text).not.toContain("null");
  });
});

describe("値下げのお知らせ", async () => {
  const { priceDropSentence } = await import("./dispatch");
  const { notifyCopy } = await import("./format");
  it("総額の改定を1文で伝える", () => {
    const line = priceDropSentence("テストタワー", { beforeTotal: 980_000, afterTotal: 920_000 });
    expect(line).toBe("先日お届けした『テストタワー』の総額が 98万円 → 92万円 に改定されました");
    expect(notifyCopy("price_down", 1, line).heading).toBe(line);
  });
});

describe("LINE の恒久的な失敗", async () => {
  const { LineApiError, isPermanentLineFailure } = await import("./line");
  it("ブロック・存在しないユーザーは恒久的、429・5xx・認証エラーは一時的", () => {
    expect(
      isPermanentLineFailure(
        new LineApiError(
          "/message/push",
          400,
          "The property, 'to', in the request body is invalid",
        ),
      ),
    ).toBe(true);
    expect(
      isPermanentLineFailure(new LineApiError("/message/push", 403, "The user has blocked")),
    ).toBe(true);
    expect(isPermanentLineFailure(new LineApiError("/message/push", 404, "Not found"))).toBe(true);
    expect(isPermanentLineFailure(new LineApiError("/message/push", 429, "rate limit"))).toBe(
      false,
    );
    expect(isPermanentLineFailure(new LineApiError("/message/push", 500, ""))).toBe(false);
    expect(
      isPermanentLineFailure(new LineApiError("/message/push", 401, "Authentication failed")),
    ).toBe(false);
    expect(isPermanentLineFailure(new Error("network"))).toBe(false);
  });
});
