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
