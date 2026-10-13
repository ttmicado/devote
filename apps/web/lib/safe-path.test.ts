import { describe, expect, it } from "vitest";
import { safePath } from "./safe-path";

describe("safePath", () => {
  it("同じサイト内のパスはそのまま", () => {
    expect(safePath("/matches?x=1")).toBe("/matches?x=1");
    expect(safePath("/properties/abc#inquiry")).toBe("/properties/abc#inquiry");
  });

  it("別オリジンになるものは fallback", () => {
    for (const bad of [
      "/\\evil.com",
      "/%09/evil.com",
      "//evil.com",
      "https://evil.com",
      "/\t/evil.com",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      const got = safePath(bad);
      expect(new URL(got, "http://localhost:3000").origin).toBe("http://localhost:3000");
    }
    expect(safePath("//evil.com")).toBe("/matches");
    expect(safePath("https://evil.com")).toBe("/matches");
    expect(safePath("/\\evil.com")).toBe("/matches");
  });

  it("fallback を指定できる", () => {
    expect(safePath("//evil.com", "/settings")).toBe("/settings");
  });
});
