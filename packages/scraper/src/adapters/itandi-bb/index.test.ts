import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import adapter, { parseSearchUrl, VERIFIED } from "./index.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");
const LOGIN = "https://itandi-accounts.com/login?client_id=itandi_bb";

describe("itandi-bb（未検証のたたき台）", () => {
  it("未検証フラグと会員サイト用の meta", () => {
    expect(VERIFIED).toBe(false);
    expect(adapter.meta).toMatchObject({ requiresLogin: true, parserVersion: "0-unverified" });
    expect(adapter.meta.fetchMode).toEqual({ list: "browser", detail: "browser" });
    expect(adapter.meta.rateLimit.minIntervalMs).toBeGreaterThanOrEqual(3000);
    expect(adapter.meta.rateLimit.maxConcurrency).toBe(1);
  });

  it("実物のログイン画面（2026-10-13 取得）をログアウト状態と判定する", () => {
    const html = fixture("login.html");
    expect(adapter.isLoggedOut?.(html, LOGIN)).toBe(true);
    // itandibb.com 側の URL のままログイン画面の HTML が返った場合も拾う
    expect(adapter.isLoggedOut?.(html, "https://itandibb.com/rent_rooms/list")).toBe(true);
  });

  it("API の JSON はログアウト扱いしない", () => {
    expect(adapter.isLoggedOut?.('{"buildings":[]}', "https://itandibb.com/rent_rooms/list")).toBe(
      false,
    );
  });

  it("賃貸 × 対象エリアのクエリ", () => {
    const qs = adapter.queries();
    expect(qs).toHaveLength(6);
    expect(qs.every((q) => q.params.deal === "rent")).toBe(true);
    const kachidoki = qs.find((q) => q.params.town === "勝どき");
    expect(kachidoki && parseSearchUrl(adapter.buildListUrl(kachidoki))).toMatchObject({
      city: "中央区",
      town: "勝どき",
      page: 1,
    });
  });

  describe("login", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("認証情報が未設定なら分かりやすいエラーで止まる", async () => {
      vi.stubEnv("ITANDI_EMAIL", "");
      vi.stubEnv("ITANDI_PASSWORD", "");
      await expect(
        adapter.login?.({ get: async () => ({ status: 0, body: "", url: "" }) }),
      ).rejects.toThrow(/ITANDI_EMAIL/);
    });
  });

  it("一覧 JSON（合成データ。キー名は公開 JS からの推測）", () => {
    const body = JSON.stringify({
      total_count: 25,
      room_total_count: 2,
      buildings: [
        {
          building_name: "テスト",
          rooms: [
            { property_id: 111, rent_yen: 150000, rent_text: "15万円" },
            { property_id: 112, rent_text: "16.5万円" },
          ],
        },
      ],
    });
    const r = adapter.parseList(body, "itandi-bb://search?deal=rent&city=港区");
    expect(r.items.map((i) => [i.sourceListingId, i.price])).toEqual([
      ["111", 150_000],
      ["112", 165_000],
    ]);
    expect(r.items[0]?.detailUrl).toBe("https://itandibb.com/rent_rooms/111");
    expect(r.nextPageUrl && parseSearchUrl(r.nextPageUrl)).toMatchObject({ city: "港区", page: 2 });
    expect(() =>
      adapter.parseList("<html></html>", "itandi-bb://search?deal=rent&city=港区"),
    ).toThrow(/JSON/);
  });
});
