import * as cheerio from "cheerio";

/**
 * 複数ページをまとめて取得するアダプター（住友不動産・森ビルなど）で共通に使う HTML ヘルパー。
 * 一覧・詳細で複数ページを取得し、<devote-bundle> に束ねて1つの HTML としてパーサへ渡す。
 */

// cheerio の要素型（domhandler）を直接 import しないための別名
type Sel = cheerio.Cheerio<any>;

/** 束ねるときに捨てる要素（パースに不要で大きいもの） */
export const DEFAULT_STRIP = "script, style, noscript, svg, iframe, select";

/** ページの <main>（無ければ <body>）だけを抜き出し、不要要素（strip）を除いた HTML */
export function extractMain(html: string, strip: string = DEFAULT_STRIP): string {
  const $ = cheerio.load(html);
  const main = $("main").first();
  const scope = main.length ? main : $("body");
  scope.find(strip).remove();
  return scope.html() ?? "";
}

export interface BundlePage {
  url: string;
  /** パーサがページを見分けるための種別（"room" / "building" など） */
  kind: string;
  html: string;
}

/**
 * 取得したページ群を1つの HTML に束ねる。
 * <devote-bundle data-source-url="…"><devote-page data-kind="…" data-url="…">…</devote-page></devote-bundle>
 */
export function bundle(pages: BundlePage[], opts: { sourceUrl?: string } = {}): string {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const open =
    opts.sourceUrl != null
      ? `<devote-bundle data-source-url="${attr(opts.sourceUrl)}">`
      : "<devote-bundle>";
  return [
    open,
    ...pages.map(
      (p) =>
        `<devote-page data-kind="${attr(p.kind)}" data-url="${attr(p.url)}">\n${p.html}\n</devote-page>`,
    ),
    "</devote-bundle>",
  ].join("\n");
}

/** 画像URLを探す属性の既定の優先順（遅延読み込みの実URL → src → srcset） */
export const LAZY_SRC_FIRST = [
  "data-src",
  "data-lazy",
  "data-original",
  "src",
  "data-srcset",
  "srcset",
];
/** srcset を優先する順（srcset の先頭が最大サイズのサイト向け） */
export const SRCSET_FIRST = [
  "data-srcset",
  "srcset",
  "data-src",
  "data-lazy",
  "data-original",
  "src",
];

/**
 * scope 内の img / source（src・data-src・srcset の先頭URL）と背景画像を、絶対URLで集める。
 * data: URI とテンプレートの埋め込み残り（"${...}"）は捨てる。
 */
export function collectImages(
  $: cheerio.CheerioAPI,
  scope: Sel,
  pageUrl: string,
  attrs: readonly string[] = LAZY_SRC_FIRST,
): string[] {
  const urls: string[] = [];
  scope.find("img, source").each((_, el) => {
    const $el = $(el);
    for (const name of attrs) {
      const v = $el.attr(name)?.trim();
      if (!v || v.startsWith("data:")) continue;
      urls.push(name.endsWith("srcset") ? (v.split(",")[0]?.trim().split(/\s+/)[0] ?? "") : v);
      break;
    }
  });
  scope.find("[style*='background-image']").each((_, el) => {
    const m = ($(el).attr("style") ?? "").match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    if (m?.[1]) urls.push(m[1]);
  });
  return urls
    .filter((u) => u !== "" && !u.includes("${"))
    .map((u) => {
      try {
        return new URL(u, pageUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u != null);
}
