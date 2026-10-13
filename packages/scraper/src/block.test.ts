import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeBody, detectBlockPage } from "./block.js";

describe("detectBlockPage", () => {
  it.each([
    [
      "Cloudflare",
      '<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>',
    ],
    ["Cloudflare ブロック", "<title>Attention Required! | Cloudflare</title>"],
    ["Imperva", "<html><body>Request unsuccessful. Incapsula incident ID: 123</body></html>"],
    ["DataDome", '<script src="https://ct.captcha-delivery.com/c.js"></script>'],
    [
      "Akamai",
      "<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>You don't have permission to access ... Reference #18.abc</BODY></HTML>",
    ],
    [
      "海外IP",
      "<html><body><p>申し訳ございません。海外からのアクセスはできません。</p></body></html>",
    ],
    [
      "小さい CAPTCHA ページ",
      '<html><body><div class="g-recaptcha" data-sitekey="x"></div></body></html>',
    ],
  ])("%s を検知する", (_, body) => {
    expect(detectBlockPage(body)).not.toBeNull();
  });

  it("403 / 429 / 503 はステータスで検知する", () => {
    expect(detectBlockPage("", 403)).toContain("403");
    expect(detectBlockPage("", 429)).toContain("429");
    expect(detectBlockPage("", 503)).toContain("503");
    expect(detectBlockPage("", 200)).toBeNull();
    expect(detectBlockPage("", 404)).toBeNull();
  });

  it("大きい通常ページに reCAPTCHA があっても誤検知しない", () => {
    const body = `<html><body>${"<p>物件</p>".repeat(5000)}<div class="g-recaptcha"></div></body></html>`;
    expect(detectBlockPage(body, 200)).toBeNull();
  });

  it("全アダプターのフィクスチャ（実サイトの保存HTML/JSON）を誤検知しない", () => {
    const root = join(import.meta.dirname, "adapters");
    const flagged: string[] = [];
    for (const adapter of readdirSync(root)) {
      const dir = join(root, adapter, "__fixtures__");
      if (!statSync(join(root, adapter)).isDirectory()) continue;
      let files: string[] = [];
      try {
        files = readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        const reason = detectBlockPage(readFileSync(join(dir, f), "utf8"), 200);
        if (reason) flagged.push(`${adapter}/${f}: ${reason}`);
      }
    }
    expect(flagged).toEqual([]);
  });
});

describe("describeBody", () => {
  it("title があれば title、無ければ先頭を短く出す", () => {
    expect(describeBody("<title> Just a moment... </title>")).toBe("Just a moment...（33バイト）");
    expect(describeBody(`{"results": []}`)).toBe(`{"results": []}（15バイト）`);
  });
});
