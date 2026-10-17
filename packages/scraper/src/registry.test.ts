import { afterEach, describe, expect, it } from "vitest";
import { enabledAdapters, pausedSourceIds } from "./registry.js";

describe("enabledAdapters", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("一時停止中のソースは、会員サイトを有効にしていても・名指ししても巡回しない", () => {
    expect(pausedSourceIds).toContain("itandi-bb");
    process.env.ENABLE_MEMBER_SOURCES = "1";
    expect(enabledAdapters().map((a) => a.meta.id)).not.toContain("itandi-bb");
    process.env.DEVOTE_SOURCES = "itandi-bb";
    expect(enabledAdapters()).toEqual([]);
  });

  it("一時停止していない会員サイト（レインズ）は巡回する", () => {
    process.env.ENABLE_MEMBER_SOURCES = "1";
    expect(enabledAdapters().map((a) => a.meta.id)).toContain("reins");
  });
});
