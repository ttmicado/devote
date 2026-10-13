import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { personalLink, signUserLink, verifyUserLink } from "./link-token";

describe("署名付きリンク", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-0123456789";
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("署名したユーザーIDを復元できる", () => {
    const t = signUserLink("user-1", 1_000);
    expect(verifyUserLink(t, 2_000)).toBe("user-1");
  });
  it("改ざん・期限切れは拒否", () => {
    const t = signUserLink("user-1", 1_000);
    const forged = `${Buffer.from("user-2.zzzzzz").toString("base64url")}.${t.split(".")[1]}`;
    expect(verifyUserLink(forged, 2_000)).toBeNull();
    expect(verifyUserLink(t, 1_000 + 15 * 24 * 3600_000)).toBeNull();
  });
  it("通知リンクは claim を経由する", () => {
    expect(personalLink("https://app", "/properties/p1?nid=n", "user-1")).toMatch(
      /^https:\/\/app\/api\/session\/claim\?t=.+&next=%2Fproperties%2Fp1%3Fnid%3Dn$/,
    );
    delete process.env.SESSION_SECRET;
    expect(personalLink("https://app", "/x", "user-1")).toBe("https://app/x");
  });
});
