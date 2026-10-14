import { describe, expect, it } from "vitest";
import { loginHoldReason } from "./login-hold.js";

const at = new Date("2026-10-14T00:00:00Z");
const run = (status: string, error: string | null) => ({ status, error, startedAt: at });
const hoursLater = (h: number) => new Date(at.getTime() + h * 3_600_000);

describe("loginHoldReason", () => {
  it("前回がログイン失敗なら24時間は止める", () => {
    const r = run("failed", "reins: ログインに失敗しました: ※ …");
    expect(loginHoldReason(r, hoursLater(2))).toMatch(/停止中/);
    expect(loginHoldReason(r, hoursLater(25))).toBeNull();
  });

  it("追加認証・同時ログインも止める", () => {
    expect(
      loginHoldReason(run("failed", "atbb: 追加認証（確認コード）が求められました"), hoursLater(1)),
    ).not.toBeNull();
    expect(
      loginHoldReason(run("failed", "atbb: …（ConcurrentLoginException）"), hoursLater(1)),
    ).not.toBeNull();
  });

  it("ログインと関係ない失敗・成功・初回は止めない", () => {
    expect(
      loginHoldReason(run("failed", "reins: 一覧の取得に失敗: HTTP 500"), hoursLater(1)),
    ).toBeNull();
    expect(loginHoldReason(run("succeeded", null), hoursLater(1))).toBeNull();
    expect(loginHoldReason(undefined, hoursLater(1))).toBeNull();
  });
});
