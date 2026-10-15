import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import adapter, { LOGIN_URL, parseSearchUrl, VERIFIED } from "./index.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");

describe("atbb（未検証のたたき台）", () => {
  it("未検証フラグと会員サイト用の meta", () => {
    expect(VERIFIED).toBe(false);
    expect(adapter.meta).toMatchObject({ requiresLogin: true, parserVersion: "0-unverified" });
    expect(adapter.meta.fetchMode).toEqual({ list: "browser", detail: "browser" });
    expect(adapter.meta.rateLimit.minIntervalMs).toBeGreaterThanOrEqual(3000);
    expect(adapter.meta.rateLimit.maxConcurrency).toBe(1);
  });

  it("実物のログイン画面（2026-10-13 取得）をログアウト状態と判定する", () => {
    const html = fixture("login.html");
    expect(adapter.isLoggedOut?.(html, LOGIN_URL)).toBe(true);
    expect(adapter.isLoggedOut?.(html, "atbb://search?deal=rent&city=港区")).toBe(true);
    expect(adapter.isLoggedOut?.("<body></body>", "https://members.athome.jp/login")).toBe(true);
  });

  it("ログイン後らしい画面・セッション切れ画面の判定", () => {
    expect(
      adapter.isLoggedOut?.("<body><h1>物件検索</h1></body>", "https://atbb.athome.jp/x"),
    ).toBe(false);
    expect(
      adapter.isLoggedOut?.(
        "<body>セッションタイムアウトしました</body>",
        "https://atbb.athome.jp/x",
      ),
    ).toBe(true);
  });

  it("賃貸・売買 × 対象エリアのクエリ", () => {
    const qs = adapter.queries();
    expect(qs).toHaveLength(14);
    const toyosu = qs.find((q) => q.params.town === "豊洲" && q.params.deal === "sale");
    expect(toyosu && parseSearchUrl(adapter.buildListUrl(toyosu))).toMatchObject({
      deal: "sale",
      city: "江東区",
      town: "豊洲",
    });
  });

  describe("login", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("認証情報が未設定なら分かりやすいエラーで止まる", async () => {
      vi.stubEnv("ATBB_USER_ID", "");
      vi.stubEnv("ATBB_PASSWORD", "");
      await expect(
        adapter.login?.({ get: async () => ({ status: 0, body: "", url: "" }) }),
      ).rejects.toThrow(/ATBB_USER_ID/);
    });
  });
});
