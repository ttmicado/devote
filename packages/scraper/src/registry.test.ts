import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memberOnlySourceIds } from "./registry.js";

describe("会員サイトの一覧（memberOnly）", () => {
  it("Web 側の写し（apps/web/lib/data.ts の MEMBER_ONLY_SOURCES）と一致する（ずれると会員サイトの物件が一般公開される）", () => {
    // Web は scraper を import しないので写しを持っている。ここでソースの文字列から読んで突き合わせる
    const src = readFileSync(join(__dirname, "../../../apps/web/lib/data.ts"), "utf8");
    const m = src.match(/MEMBER_ONLY_SOURCES[^=]*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const web = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect([...web].sort()).toEqual([...memberOnlySourceIds].sort());
  });
});
