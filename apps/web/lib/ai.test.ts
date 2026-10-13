import { describe, expect, it } from "vitest";
import {
  applyPatch,
  buildHistory,
  clampToolResult,
  emptyCondition,
  featureText,
  previewForModel,
  toDisplay,
} from "./ai";

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

describe("事業用", () => {
  it("事業用にすると賃貸に固定する", () => {
    const r = applyPatch(emptyCondition(), { dealType: "sale", usage: "business" });
    expect(r.data).toMatchObject({ dealType: "rent", usage: "business" });
  });
});

describe("新しい条件項目", () => {
  it("契約・駐車場は項目単位でマージし、町名・部屋数・入居時期を入れられる", () => {
    const a = applyPatch(emptyCondition(), {
      areas: { towns: ["南麻布"], excludeTowns: ["六本木"] },
      hard: { minRooms: 2, moveInBy: "2027-03", contract: { corporate: "corporate" } },
    });
    expect(a.success).toBe(true);
    const b = applyPatch(a.data!, {
      hard: { parking: { count: 2 }, contract: { fixedTerm: "ng" } },
    });
    expect(b.data?.hard).toMatchObject({
      minRooms: 2,
      moveInBy: "2027-03",
      contract: { corporate: "corporate", fixedTerm: "ng" },
      parking: { count: 2, note: null },
    });
    expect(b.data?.areas).toMatchObject({ towns: ["南麻布"], excludeTowns: ["六本木"] });
  });

  it("配列は上限で切り、重複を除く", () => {
    const many = Array.from({ length: 50 }, (_, i) => `駅${i}`);
    const r = applyPatch(emptyCondition(), { areas: { stations: [...many, "駅0"] } });
    expect(r.data?.areas.stations).toHaveLength(20);
  });

  it("要相談タグは「可」のタグに読み替え、不明なタグはエラーにする", () => {
    const r = applyPatch(emptyCondition(), { hard: { requiredFeatures: ["pet_negotiable"] } });
    expect(r.data?.hard.requiredFeatures).toEqual(["pet_ok"]);
    const bad = applyPatch(emptyCondition(), { soft: [{ feature: "pool", weight: 1 }] });
    expect(bad.success).toBe(false);
    expect(bad.error?.message).toContain("pool");
  });

  it("入居時期の形式が不正ならエラー", () => {
    expect(applyPatch(emptyCondition(), { hard: { moveInBy: "来年春" } }).success).toBe(false);
  });

  it("古い保存形式（新しい項目なし）も読み込める", async () => {
    const { SearchCondition } = await import("@devote/core");
    const old = {
      dealType: "rent",
      areas: { stations: [], cities: ["港区"] },
      hard: {
        maxPrice: 300000,
        minAreaSqm: null,
        maxWalkMinutes: null,
        layouts: [],
        maxBuildingAgeYears: null,
        minFloor: null,
        requiredFeatures: [],
      },
      tolerance: {},
      soft: [],
    };
    const r = SearchCondition.safeParse(old);
    expect(r.success).toBe(true);
    expect(r.data?.hard.contract).toEqual({ corporate: "either", fixedTerm: "ok" });
    expect(r.data?.areas.towns).toEqual([]);
  });
});

describe("featureText", () => {
  it("住まい／事業用／共通に分け、要相談タグは載せない", () => {
    expect(featureText).toMatch(/- 住まい: .*pet_ok=ペット可/);
    expect(featureText).toMatch(/- 事業用: .*skeleton=スケルトン/);
    expect(featureText).toMatch(/- 共通: .*auto_lock=オートロック/);
    expect(featureText).not.toContain("pet_negotiable");
  });
});

describe("buildHistory", () => {
  const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
  const say = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
  const call = (id: string) => ({
    role: "assistant",
    content: [{ type: "tool_use", id, name: "preview_matches", input: {} }],
  });
  const result = (id: string) => ({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: "{}" }],
  });

  it("結果のない tool_use（途中で落ちたターン）は送らない", () => {
    const rows = [user("a"), call("t1"), user("b")];
    expect(buildHistory(rows)).toEqual([user("a"), user("b")]);
    // 末尾に残った場合も
    expect(buildHistory([user("a"), call("t1")])).toEqual([user("a")]);
  });

  it("途中の壊れた組も飛ばし、正常な組は残す", () => {
    const rows = [
      user("a"),
      call("t1"),
      result("x"),
      say("1"),
      user("b"),
      call("t2"),
      result("t2"),
      say("2"),
    ];
    expect(buildHistory(rows)).toEqual([
      user("a"),
      say("1"),
      user("b"),
      call("t2"),
      result("t2"),
      say("2"),
    ]);
  });

  it("直近に絞るときは、お客様の発言から始め、呼び出しと結果を分けない", () => {
    const rows = [user("a"), say("1"), user("b"), call("t"), result("t"), say("2")];
    // 4行に絞ると先頭がお客様の発言「b」になり、呼び出しと結果の組はそのまま残る
    const h = buildHistory(rows, 4);
    expect(h[0]).toEqual(user("b"));
    expect(h).toHaveLength(4);
  });
});

describe("ツール結果の長さ", () => {
  it("長い結果は切り詰める", () => {
    expect(clampToolResult("あ".repeat(5000)).length).toBeLessThan(4100);
  });

  it("取り込み前（掲載0件）は市況に触れないよう伝える", () => {
    const s = previewForModel({
      total: 0,
      totalActive: 0,
      activeInAreas: 0,
      withCompromise: 0,
      topExclusions: [],
      samples: [],
    });
    expect(JSON.parse(s)).toMatchObject({
      totalActive: 0,
      note: expect.stringContaining("取り込み前"),
    });
  });

  it("エリアに物件があり条件で外れているときは、除外理由を添える", () => {
    const s = previewForModel({
      total: 0,
      totalActive: 120,
      activeInAreas: 14,
      withCompromise: 0,
      topExclusions: [{ reason: "予算超過", count: 9 }],
      samples: [],
    });
    expect(JSON.parse(s)).toMatchObject({
      activeInAreas: 14,
      topExclusions: [{ reason: "予算超過", count: 9 }],
    });
  });
});

describe("buildHistory（組を分けない）", () => {
  it("切り詰めの先頭が tool_result になるときは、次のお客様の発言まで進める", () => {
    const rows = [
      { role: "user", content: [{ type: "text", text: "a" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t", name: "x", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{}" }] },
      { role: "assistant", content: [{ type: "text", text: "1" }] },
      { role: "user", content: [{ type: "text", text: "b" }] },
      { role: "assistant", content: [{ type: "text", text: "2" }] },
    ];
    const h = buildHistory(rows, 4);
    expect(h[0]).toEqual(rows[4]);
    expect(h).toHaveLength(2);
  });
});
