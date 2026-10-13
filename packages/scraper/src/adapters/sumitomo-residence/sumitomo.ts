import { createHash } from "node:crypto";
import {
  extractFeatures,
  type NormalizedListingInput,
  parseAreaSqm,
  parseBuiltYearMonth,
  parseLayout,
  parseStationAccess,
  parseYen,
  type StationAccess,
  splitAddress,
} from "@devote/core";
import * as cheerio from "cheerio";
import {
  defineAdapter,
  type FetchContext,
  type ListItem,
  type SearchQuery,
  type SiteAdapter,
} from "../../adapter.js";
import { describeBody, detectBlockPage } from "../../block.js";
import {
  parseDepositLike,
  parseFloorLabel,
  parseMainStructure,
  parseTotalFloors,
  splitFeeLine,
} from "./helpers.js";

/**
 * 住友不動産の賃貸サイト共通実装。
 * - residence.sumitomo-latour.jp（住友不動産の賃貸レジデンス）
 * - www.sumitomo-latour.jp（ラ・トゥール。高級賃貸ブランド。物件＝建物の集合が別）
 * の2サイトは同じCMSで、URL構成・HTML構造がほぼ共通（CSSクラス名の接頭辞だけ違う）。
 *
 * 構造: 建物（/buildlist/<area>/<slug>/）→ 空室一覧（.../unit_empty/）→ 部屋（.../<unitId>/）
 * サイトの空室検索（/search/doSearch.php）はセッション（PHPSESSID）に条件を保存して
 * area_result.php へリダイレクトする方式で、cookie を持たない HTTP フェッチャーでは使えない。
 * そのため一覧は「エリアの建物一覧（またはトップのラインナップ）→ 各建物の空室一覧」を
 * fetchList でまとめて取得し、1つの HTML（<devote-bundle>）に束ねて parseList に渡す。
 * 詳細は部屋ページ＋建物概要ページ（竣工・構造・共用設備・外観写真）を束ねる。
 */
export interface SumitomoSiteConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  queries: SearchQuery[];
  /** 一覧インデックスのURL（エリア一覧ページ or トップ） */
  buildListUrl: (q: SearchQuery) => string;
  /** インデックスURLからエリアが分からないとき（トップ等）に巡回するエリアslug */
  defaultAreas: string[];
  parserVersion: string;
}

// cheerio の要素型（domhandler）を直接 import しないための別名
type Sel = cheerio.Cheerio<any>;

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const BUILDING_PATH = /^\/buildlist\/([^/]+)\/([^/]+)\/(?:unit_empty\/)?$/;
const ROOM_PATH = /^\/buildlist\/[^/]+\/[^/]+\/(\d+)\/?$/;
/** 束ねるときに捨てる要素（パースに不要で大きいもの） */
const STRIP = "script, style, noscript, svg, iframe, select, .navLayout_nav, #nav_search_form";

async function getOk(ctx: FetchContext, url: string) {
  const res = await ctx.get(url);
  const blocked = detectBlockPage(res.body, res.status);
  if (blocked)
    throw new Error(`ブロック・チャレンジの可能性（${blocked}）: ${url} ${describeBody(res.body)}`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${url}`);
  return res;
}

/** ページの <main> だけを抜き出し、不要要素を除いた HTML */
export function extractMain(html: string): string {
  const $ = cheerio.load(html);
  const main = $("main").first();
  const scope = main.length ? main : $("body");
  scope.find(STRIP).remove();
  return scope.html() ?? "";
}

export function bundle(sourceUrl: string, pages: { url: string; kind: string; html: string }[]) {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return [
    `<devote-bundle data-source-url="${attr(sourceUrl)}">`,
    ...pages.map(
      (p) =>
        `<devote-page data-kind="${p.kind}" data-url="${attr(p.url)}">\n${p.html}\n</devote-page>`,
    ),
    "</devote-bundle>",
  ].join("\n");
}

/**
 * インデックスページから空室のある建物の空室一覧URLを列挙する。
 * 「公開空室0室」「公開空室無し」と明示されている建物は取得しない。
 */
export function extractBuildingUrls(html: string, indexUrl: string, defaultAreas: string[]) {
  return [...scanBuildings(html, indexUrl, defaultAreas).entries()]
    .filter(([, v]) => v)
    .map(([root]) => `${root}unit_empty/`);
}

/**
 * インデックスページに載っている対象エリアの建物（空室の有無を問わない）の数。
 * 0 ならブロックページ・構造変化・リダイレクト先の誤りで、空室0とは区別する。
 */
export function countBuildingLinks(html: string, indexUrl: string, defaultAreas: string[]) {
  return scanBuildings(html, indexUrl, defaultAreas).size;
}

/** 建物のルートURL → 空室ありか（不明は true） */
function scanBuildings(html: string, indexUrl: string, defaultAreas: string[]) {
  const $ = cheerio.load(html);
  const base = new URL(indexUrl);
  const indexArea = base.pathname.match(/^\/buildlist\/([^/]+)\/$/)?.[1];
  const areas = new Set(indexArea ? [indexArea] : defaultAreas);
  const roots = new Map<string, boolean>(); // root URL → 空室ありか（不明は true）
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (u.host !== base.host) return;
    const m = u.pathname.match(BUILDING_PATH);
    if (!m?.[1] || !areas.has(m[1])) return;
    const root = `${u.origin}/buildlist/${m[1]}/${m[2]}/`;
    const count = squash($(a).text()).match(/公開空室\s*(\d+|無し|なし)/)?.[1];
    const hasVacancy = count == null ? true : /^\d+$/.test(count) && Number(count) > 0;
    roots.set(root, (roots.get(root) ?? true) && hasVacancy);
  });
  return roots;
}

/** class 属性のいずれかのトークンが suffix で終わる要素 */
function byClassSuffix($: cheerio.CheerioAPI, scope: Sel, suffix: string) {
  return scope
    .find(`[class*="${suffix}"]`)
    .filter((_, el) => ($(el).attr("class") ?? "").split(/\s+/).some((c) => c.endsWith(suffix)));
}

/** img / source の src・data-src・srcset（先頭のURL）・背景画像を絶対URLで集める */
function collectImages($: cheerio.CheerioAPI, scope: Sel, pageUrl: string) {
  const urls: string[] = [];
  scope.find("img, source").each((_, el) => {
    const $el = $(el);
    for (const attr of ["data-src", "data-lazy", "data-original", "src", "data-srcset", "srcset"]) {
      const v = $el.attr(attr)?.trim();
      if (!v || v.startsWith("data:")) continue;
      urls.push(attr.endsWith("srcset") ? (v.split(",")[0]?.trim().split(/\s+/)[0] ?? "") : v);
      break;
    }
  });
  scope.find("[style*='background-image']").each((_, el) => {
    const m = ($(el).attr("style") ?? "").match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    if (m?.[1]) urls.push(m[1]);
  });
  return urls
    .filter((u) => u !== "")
    .map((u) => {
      try {
        return new URL(u, pageUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u != null);
}

function textWithBreaks($: cheerio.CheerioAPI, el: Sel, sep = "\n") {
  const c = el.clone();
  c.find("br").replaceWith(" ");
  const parts = c.find("span[class$='itemTxt'], span[class*='itemTxt ']").toArray();
  const texts = parts.length
    ? parts.map((p) => squash($(p).text()))
    : c
        .children()
        .toArray()
        .map((p) => squash($(p).text()));
  const joined = texts.filter(Boolean).join(sep);
  return joined || squash(c.text());
}

export function createSumitomoAdapter(cfg: SumitomoSiteConfig): SiteAdapter {
  /** 建物概要ページは部屋ごとに同じなので、巡回中はキャッシュする（6時間） */
  const buildingCache = new Map<string, { at: number; html: string }>();
  const BUILDING_TTL_MS = 6 * 60 * 60 * 1000;

  return defineAdapter({
    meta: {
      id: cfg.id,
      displayName: cfg.displayName,
      kind: "realtor_own",
      fetchMode: { list: "http", detail: "http" },
      requiresLogin: false,
      rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
      schedule: { listCron: "15 */6 * * *", detailRevisitHours: 24 },
      parserVersion: cfg.parserVersion,
    },

    queries: () => cfg.queries,
    buildListUrl: cfg.buildListUrl,

    async fetchList(ctx, url) {
      const index = await getOk(ctx, url);
      // 建物リンクが1件も無いインデックスは「空室0」ではなく異常（ブロック・構造変化）。
      // 黙って0件の一覧にせず、エラーにしてログに残す
      if (countBuildingLinks(index.body, index.url, cfg.defaultAreas) === 0) {
        throw new Error(
          `建物一覧に対象エリアの建物リンクが無い（ブロック・構造変化の可能性）: ${index.url} ${describeBody(index.body)}`,
        );
      }
      const pages: { url: string; kind: string; html: string }[] = [];
      for (const u of extractBuildingUrls(index.body, index.url, cfg.defaultAreas)) {
        const res = await getOk(ctx, u);
        pages.push({ url: res.url, kind: "unit_empty", html: extractMain(res.body) });
      }
      return bundle(url, pages);
    },

    async fetchDetail(ctx, item) {
      const room = await getOk(ctx, item.detailUrl);
      const pages = [{ url: room.url, kind: "room", html: extractMain(room.body) }];
      const buildingUrl = new URL("../", room.url).toString();
      const cached = buildingCache.get(buildingUrl);
      if (cached && Date.now() - cached.at < BUILDING_TTL_MS) {
        pages.push({ url: buildingUrl, kind: "building", html: cached.html });
      } else {
        const res = await ctx.get(buildingUrl);
        if (res.status === 200) {
          const html = extractMain(res.body);
          buildingCache.set(buildingUrl, { at: Date.now(), html });
          pages.push({ url: buildingUrl, kind: "building", html });
        }
      }
      return bundle(item.detailUrl, pages);
    },

    parseList(html, url) {
      const $ = cheerio.load(html);
      const pageEls = $("devote-page").toArray();
      const pages = pageEls.length
        ? pageEls.map((p) => ({ scope: $(p) as Sel, url: $(p).attr("data-url") ?? url }))
        : [{ scope: $.root() as Sel, url }];
      const items = new Map<string, ListItem>();
      let total: number | null = 0;
      for (const page of pages) {
        const stated = squash(
          page.scope.find("[class$='stateTxt'], [class$='emptyTxt'], .result_leadBlock_txt").text(),
        );
        const n = stated.match(/(\d+)\s*室の空室/)?.[1];
        if (n != null) total = total == null ? null : total + Number(n);
        else if (!/空室は(?:ありません|ございません)|空室がありません/.test(stated)) total = null;

        byClassSuffix($, page.scope, "_roomItem").each((_, el) => {
          const $el = $(el);
          const link = $el
            .find("a[href]")
            .toArray()
            .map((a) => new URL($(a).attr("href") ?? "", page.url))
            .find((u) => ROOM_PATH.test(u.pathname));
          const unitId = link?.pathname.match(ROOM_PATH)?.[1];
          if (!link || !unitId) throw new Error(`空室の行から部屋ID/リンクが取れない: ${page.url}`);
          const rent = squash(byClassSuffix($, $el, "PriceUnit").first().text());
          const name = squash($el.find(".checkName").first().text());
          items.set(unitId, {
            sourceListingId: unitId,
            detailUrl: link.toString(),
            listHash: sha1(
              [rent, name, squash($el.find("[class$='roomNote']").first().text())].join("|"),
            ),
            price: parseYen(rent) ?? undefined,
          });
        });
      }
      return { items: [...items.values()], nextPageUrl: null, totalCount: total };
    },

    parseDetail(html, url) {
      const $ = cheerio.load(html);
      const roomEl = $("devote-page[data-kind='room']");
      const room: Sel = roomEl.length ? roomEl.first() : $.root();
      const roomUrl = roomEl.attr("data-url") ?? url;
      const bldg = $("devote-page[data-kind='building']").first();
      const bldgUrl = bldg.attr("data-url") ?? url;

      const unitId =
        new URL(url).pathname.match(ROOM_PATH)?.[1] ??
        room.find("[data-unit_id]").first().attr("data-unit_id");
      if (!unitId) throw new Error(`部屋IDが取れない: ${url}`);

      const fields: Record<string, string> = {
        建物名: squash(room.find("h1 .ja").first().text() || bldg.find("h1 .ja").first().text()),
        部屋: squash(room.find(".roomDetail_ttl").first().text()),
      };
      room.find(".roomDetail_info_item").each((_, it) => {
        const key = squash($(it).find("dt").first().text()).replace(/\s/g, "");
        const dd = $(it).find("dd").first();
        if (!key) return;
        const price = dd.find(".roomDetail_info_price");
        if (price.length) {
          fields[key] = squash(price.text()).replace(/\s/g, "");
          fields[`${key}備考`] = squash(dd.children("span").text());
        } else {
          fields[key] = textWithBreaks($, dd);
        }
      });
      bldg.find("dl > div").each((_, row) => {
        const key = squash($(row).children("dt").text()).replace(/\s/g, "");
        if (!key || fields[key] != null) return;
        fields[key] = textWithBreaks($, $(row).children("dd"));
      });
      const services = bldg
        .find("ul.buildlist_service_list > li, ul.detail_service > li")
        .toArray()
        .map((li) => squash($(li).text()))
        .filter(Boolean);
      if (services.length) fields.建物設備 = services.join("、");

      const roomImages = [
        ...collectImages($, room.find(".roomDetail_tab_planImg"), roomUrl),
        ...collectImages($, room.find("#main-carousel"), roomUrl),
      ];
      const bldgImages = collectImages($, bldg, bldgUrl).filter(
        (u) => /\/bldg\/\d+\/img\//.test(u) && !/_sp\.\w+$/.test(u),
      );
      return {
        sourceListingId: unitId,
        url: roomUrl,
        fields,
        imageUrls: [...new Set([...roomImages, ...bldgImages])],
      };
    },

    normalize(raw): NormalizedListingInput {
      const f = raw.fields;
      const price = parseYen(f.賃料);
      if (price == null || price <= 0) throw new Error(`賃料が解釈できない: ${f.賃料}`);

      const fees = splitFeeLine(f.賃料備考);
      const stations = (f.交通 ?? f.最寄駅 ?? "")
        .split("\n")
        .map((line) => parseStationAccess(line))
        .filter((s): s is StationAccess => s != null);
      const addressRaw = f.住所 ?? "";
      const updated = f.更新日?.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      const extraKeys = ["部屋", "入居時期", "契約形態", "その他", "戸数", "建物設備", "賃料備考"];

      return {
        source: cfg.id,
        sourceListingId: raw.sourceListingId,
        url: raw.url,
        dealType: "rent",
        title: f.建物名 || null,
        address: { ...splitAddress(addressRaw), raw: addressRaw },
        stations,
        price,
        managementFee: parseYen(fees.共益費 ?? fees.管理費 ?? fees["管理費・共益費"]),
        deposit: parseDepositLike(fees.敷金 ?? fees.保証金, price),
        keyMoney: parseDepositLike(fees.礼金, price),
        layout: parseLayout(f.間取),
        areaSqm: parseAreaSqm(f.間取),
        builtYearMonth: parseBuiltYearMonth(f.竣工年月),
        floor: parseFloorLabel(f.階数),
        totalFloors: parseTotalFloors(f.構造規模),
        structure: parseMainStructure(f.構造規模),
        direction: null,
        features: extractFeatures([f.建物設備, f.その他].filter(Boolean).join("、")),
        transactionMode: "owner",
        adAllowed: null,
        agencyName: "住友不動産",
        imageUrls: raw.imageUrls,
        sourceUpdatedAt: updated
          ? new Date(
              `${updated[1]}-${updated[2]?.padStart(2, "0")}-${updated[3]?.padStart(2, "0")}T00:00:00+09:00`,
            ).toISOString()
          : null,
        propertyType: "mansion",
        extra: Object.fromEntries(extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string])),
      };
    },
  });
}
