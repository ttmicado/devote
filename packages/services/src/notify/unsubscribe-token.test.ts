import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUserLink } from "../link-token";
import { signUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./unsubscribe-token";

describe("配信停止トークン", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-0123456789";
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("署名して検証できる", () => {
    const t = signUnsubscribeToken("user-1");
    expect(verifyUnsubscribeToken(t)).toBe("user-1");
  });

  it("改ざん・期限切れ・別の用途のトークンは拒否する", () => {
    const t = signUnsubscribeToken("user-1");
    const [payload, sig] = t.split(".");
    const forged = `${Buffer.from("user-2.zzzzzz").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.x${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(t, Date.now() + 181 * 24 * 3600_000)).toBeNull();
    expect(verifyUnsubscribeToken(signUserLink("user-1"))).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });

  it("URL にトークンを付ける。秘密鍵がなければお届け設定へ", () => {
    expect(unsubscribeUrl("https://app", "user-1")).toMatch(/^https:\/\/app\/api\/unsubscribe\?t=/);
    delete process.env.SESSION_SECRET;
    expect(unsubscribeUrl("https://app", "user-1")).toBe("https://app/settings");
  });
});
