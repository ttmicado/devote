import { describe, expect, it } from "vitest";
import { applyPatch, emptyCondition, toDisplay } from "./ai";

describe("applyPatch", () => {
  it("hard / tolerance は項目単位でマージする", () => {
    const a = applyPatch(emptyCondition(), {
      hard: { maxPrice: 300_000 },
      areas: { cities: ["港区"] },
    });
    expect(a.success).toBe(true);
    const b = applyPatch(a.data!, { hard: { minAreaSqm: 70 }, tolerance: { areaSqm: 0.5 } });
    expect(b.data?.hard).toMatchObject({ maxPrice: 300_000, minAreaSqm: 70 });
    expect(b.data?.tolerance.areaSqm).toBe(0.5);
    expect(b.data?.areas.cities).toEqual(["港区"]);
  });

  it("不正な値はエラーにする（AIに返して直させる）", () => {
    expect(applyPatch(emptyCondition(), { hard: { maxPrice: -1 } }).success).toBe(false);
  });
});

describe("toDisplay", () => {
  it("ユーザー発言は先頭テキストのみ、ツール結果と思考は表示しない", () => {
    const rows = [
      {
        role: "user",
        content: [
          { type: "text", text: "港区で探しています" },
          { type: "text", text: "<current_state>{}</current_state>" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "承知しました" },
          { type: "tool_use", id: "t", name: "update_criteria", input: {} },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{}" }] },
      { role: "assistant", content: [{ type: "text", text: "ご予算は？" }] },
    ];
    expect(toDisplay(rows)).toEqual([
      { role: "user", text: "港区で探しています" },
      { role: "assistant", text: "承知しました" },
      { role: "assistant", text: "ご予算は？" },
    ]);
  });
});
