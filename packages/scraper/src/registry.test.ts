import { afterEach, describe, expect, it } from "vitest";
import { adapters, enabledAdapters, retiredSourceIds } from "./registry.js";

describe("enabledAdapters", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("ITANDI BB は除外済み（アダプターが無く、名指ししても巡回・ログインしない）", () => {
    expect(retiredSourceIds).toContain("itandi-bb");
    expect(adapters["itandi-bb"]).toBeUndefined();
    process.env.ENABLE_MEMBER_SOURCES = "1";
    expect(enabledAdapters().map((a) => a.meta.id)).not.toContain("itandi-bb");
    process.env.DEVOTE_SOURCES = "itandi-bb";
    expect(enabledAdapters()).toEqual([]);
  });

  it("会員サイトのレインズは巡回する", () => {
    process.env.ENABLE_MEMBER_SOURCES = "1";
    expect(enabledAdapters().map((a) => a.meta.id)).toContain("reins");
  });
});
