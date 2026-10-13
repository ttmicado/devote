import { describe, expect, it } from "vitest";
import { hashPassword, normalizeLoginId, verifyPassword } from "./password";

describe("password", () => {
  it("ハッシュして検証できる", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
  });
  it("ログインIDの正規化", () => {
    expect(normalizeLoginId(" Tashiro@Example.com ")).toBe("tashiro@example.com");
    expect(normalizeLoginId("ＡＢＣＤ")).toBe("abcd");
    expect(normalizeLoginId("ab")).toBeNull();
    expect(normalizeLoginId("田代")).toBeNull();
  });
});
