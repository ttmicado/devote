import { describe, expect, it } from "vitest";
import { classifyHold, holdMinutes, loginHoldReason } from "./login-hold.js";

const at = new Date("2026-10-15T02:00:00Z"); // JST 11:00
const run = (status: string, error: string | null) => ({ status, error, startedAt: at });
const minutesLater = (m: number) => new Date(at.getTime() + m * 60_000);

describe("loginHoldReason（止まったら待ってから再開する）", () => {
  it("同じIDで利用中（同時ログイン不可）は 60分待って再開", () => {
    const r = run(
      "failed",
      "atbb: 同じIDで別の端末が ATBB を利用中のため検索に入れません（ConcurrentLoginException）",
    );
    expect(classifyHold(r.error)).toBe("in_use");
    expect(loginHoldReason(r, minutesLater(30), {})).toMatch(/利用中.*12:00 まで待機/);
    expect(loginHoldReason(r, minutesLater(60), {})).toBeNull();
  });

  it("セッション切れは 30分待って再開", () => {
    const r = run("failed", "reins: セッション切れ");
    expect(loginHoldReason(r, minutesLater(10), {})).not.toBeNull();
    expect(loginHoldReason(r, minutesLater(30), {})).toBeNull();
  });

  it("ログイン失敗・追加認証は 24時間待つ（アカウントロック防止）", () => {
    const r = run("failed", "reins: ログインに失敗しました: ※ …");
    expect(classifyHold(r.error)).toBe("auth");
    expect(loginHoldReason(r, minutesLater(23 * 60), {})).not.toBeNull();
    expect(loginHoldReason(r, minutesLater(24 * 60), {})).toBeNull();
    expect(classifyHold("atbb: 追加認証（確認コード）が求められました")).toBe("auth");
    expect(classifyHold("atbb: 検索に画像認証が必要（自動では突破しない。人が対応）")).toBe("auth");
  });

  it("待ち時間は環境変数で変えられる", () => {
    expect(holdMinutes("in_use", { LOGIN_HOLD_IN_USE_MINUTES: "120" })).toBe(120);
    expect(holdMinutes("auth", { LOGIN_HOLD_AUTH_MINUTES: "abc" })).toBe(24 * 60);
    const r = run("failed", "atbb: …（ConcurrentLoginException）");
    expect(
      loginHoldReason(r, minutesLater(90), { LOGIN_HOLD_IN_USE_MINUTES: "120" }),
    ).not.toBeNull();
  });

  it("ログインと関係ない失敗・成功・初回は待たない", () => {
    expect(
      loginHoldReason(run("failed", "reins: 一覧の取得に失敗: HTTP 500"), minutesLater(1), {}),
    ).toBeNull();
    expect(loginHoldReason(run("succeeded", null), minutesLater(1), {})).toBeNull();
    expect(loginHoldReason(undefined, minutesLater(1), {})).toBeNull();
  });
});
