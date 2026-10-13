import { createHash } from "node:crypto";
import {
  directionFeatures,
  extractFeatures,
  type NormalizedListingInput,
  parseAreaSqm,
  parseBuiltYearMonth,
  parseFloor,
  parseStationAccess,
  type StationAccess,
  splitAddress,
} from "@devote/core";
import * as cheerio from "cheerio";
import { defineAdapter, type FetchContext, type ListItem } from "../../adapter.js";
import {
  findDirection,
  parseFeeLoose,
  parseLayoutLoose,
  parseMainStructure,
  parseMonthsLoose,
  parseTotalFloors,
  parseYenWithSymbol,
  pickBuildingLine,
} from "./helpers.js";

/**
 * 森ビル MORI LIVING（https://www.moriliving.com/ja/residence/）の賃貸・分譲レジデンス。
 *
 * 一覧: 物件検索（/ja/search/lease/）は SPA で、全空室を内部 JSON（/api/lease_ja.json,
 *       /api/sale_ja.json）から一括取得してクライアント側で絞り込む。JSON は部屋単位で、
 *       ページングは無い。住所を含まないためエリア絞り込みは後段（isInTargetArea）で行う
 *       （掲載物件はほぼ港区。表参道=渋谷区も含む）。
 * 詳細: 部屋ページ（/ja/vacancy/<建物コード>/<部屋番号>.html）は SSR。
 *       外観写真は建物ページ（/ja/residence/<slug>/）にしか無いので束ねて取得する（建物はキャッシュ）。
 */
const BASE_URL = "https://www.moriliving.com";
const SOURCE = "mori-living";

interface MoriListJson {
  results: {
    id: string;
    residence: string;
    room: string;
    spec: string[];
    price: string;
    url: string;
    images?: string[];
    details?: { name: string; description: string }[];
  }[];
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** 束ねるときに捨てる要素（パースに不要で大きいもの） */
const STRIP = "script, style, noscript, svg, iframe, select";

/** "/ja/vacancy/0101/A610.html" → "0101-A610"（部屋単位で一意） */
export function listingIdFromUrl(url: string): string {
  const path = new URL(url, BASE_URL).pathname
    .replace(/^\/(?:ja|en)\//, "")
    .replace(/\.html$/, "")
    .replace(/^vacancy\//, "");
  if (!path) throw new Error(`部屋IDが取れない: ${url}`);
  return path.replace(/\//g, "-");
}

async function getOk(ctx: FetchContext, url: string) {
  const res = await ctx.get(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${url}`);
  return res;
}

function extractMain(html: string): string {
  const $ = cheerio.load(html);
  const main = $("main").first();
  const scope = main.length ? main : $("body");
  scope.find(STRIP).remove();
  return scope.html() ?? "";
}

function bundle(pages: { url: string; kind: string; html: string }[]) {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return [
    "<devote-bundle>",
    ...pages.map(
      (p) =>
        `<devote-page data-kind="${p.kind}" data-url="${attr(p.url)}">\n${p.html}\n</devote-page>`,
    ),
    "</devote-bundle>",
  ].join("\n");
}

// cheerio の要素型（domhandler）を直接 import しないための別名
type Sel = cheerio.Cheerio<any>;

/** 改行（<br> と生の改行）を保ったテキスト */
function multiline($: cheerio.CheerioAPI, el: Sel): string {
  const c = el.clone();
  c.find("br").replaceWith("\n");
  return c
    .text()
    .split("\n")
    .map((l) => squash(l))
    .filter(Boolean)
    .join("\n");
}

/** img / source の src・data-src・srcset（先頭=最大のURL）・背景画像を絶対URLで集める */
function collectImages($: cheerio.CheerioAPI, scope: Sel, pageUrl: string): string[] {
  const urls: string[] = [];
  scope.find("img, source").each((_, el) => {
    const $el = $(el);
    for (const attr of ["data-srcset", "srcset", "data-src", "data-lazy", "data-original", "src"]) {
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

/** 部屋ページで写真として扱わない画像（ダミー間取り・バナー等） */
const NOT_ROOM_PHOTO = /\/assets\/images\/(?:common\/search_result|others|icons?|logo)\//;

const buildingCache = new Map<string, { at: number; html: string }>();
const BUILDING_TTL_MS = 6 * 60 * 60 * 1000;

export default defineAdapter({
  meta: {
    id: SOURCE,
    displayName: "森ビル MORI LIVING（レジデンス）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "30 */3 * * *", detailRevisitHours: 24 },
    parserVersion: "1",
  },

  queries: () => [
    { key: "lease", params: { kind: "lease" } },
    { key: "sale", params: { kind: "sale" } },
  ],

  buildListUrl: (q) => `${BASE_URL}/api/${q.params.kind}_ja.json`,

  parseList(body, url) {
    let json: MoriListJson;
    try {
      json = JSON.parse(body) as MoriListJson;
    } catch {
      throw new Error(`一覧JSONが解釈できない: ${url}`);
    }
    if (!Array.isArray(json.results)) throw new Error(`一覧JSONに results が無い: ${url}`);
    const items: ListItem[] = json.results.map((r) => {
      if (!r.url) throw new Error(`一覧の行に url が無い: ${JSON.stringify(r).slice(0, 200)}`);
      const detailUrl = new URL(r.url, BASE_URL).toString();
      return {
        sourceListingId: listingIdFromUrl(detailUrl),
        detailUrl,
        listHash: sha1([r.price, ...(r.spec ?? []), JSON.stringify(r.details ?? [])].join("|")),
        price: parseYenWithSymbol(r.price) ?? undefined,
      };
    });
    return { items, nextPageUrl: null, totalCount: json.results.length };
  },

  async fetchDetail(ctx, item) {
    const room = await getOk(ctx, item.detailUrl);
    const pages = [{ url: room.url, kind: "room", html: extractMain(room.body) }];
    const href = cheerio.load(room.body)("a.psrOutlineDateLink").attr("href");
    if (href) {
      const buildingUrl = new URL(href, room.url).toString();
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
    }
    return bundle(pages);
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const roomEl = $("devote-page[data-kind='room']");
    const room: Sel = roomEl.length ? roomEl.first() : $.root();
    const roomUrl = roomEl.attr("data-url") ?? url;
    const bldg = $("devote-page[data-kind='building']").first();
    const bldgUrl = bldg.attr("data-url") ?? url;

    const fields: Record<string, string> = {
      種別: squash(room.find(".psrOutline .psrTableT").first().text()),
      建物名: squash(room.find(".psrOutlineDateName").first().text()),
      部屋番号: squash(room.find(".psrOutlineDateNum").first().text()),
      価格: squash(room.find(".psrOutlineDatePrice").first().text()),
    };
    room.find(".psrOutlineDateSpec li").each((_, li) => {
      const t = squash($(li).text());
      if (/㎡|m2|m²|平米/i.test(t)) fields.専有面積 = t;
      else if (/^(?:地下)?\d+\s*(?:階|F)$|^B\d+F$/i.test(t.normalize("NFKC"))) fields.所在階 = t;
      else if (t) fields.間取り = t;
    });
    room.find("dl.psrPropertyTable, dl.psrBuildingTable").each((_, dl) => {
      const key = squash($(dl).children("dt").text()).replace(/\s/g, "");
      if (!key || fields[key] != null) return;
      fields[key] = multiline($, $(dl).children("dd"));
    });
    const pet = room.find(".psrPetTitle").first().text();
    if (pet) fields.ペット = squash(pet);
    const owner = squash(room.find(".psrLinkOwner").first().text()).match(
      /(貸主|売主|代理|媒介|仲介)[^：:]*[：:]\s*([^\s宅]+)/,
    );
    if (owner?.[1]) fields.取引態様 = owner[1];
    if (owner?.[2]) fields.広告主 = owner[2];

    const roomImages = collectImages($, room, roomUrl).filter((u) => !NOT_ROOM_PHOTO.test(u));
    const bldgImages = collectImages($, bldg, bldgUrl).filter(
      (u) => /\/assets\/images\/(?:common|pc)\/residence\//.test(u) && !/\/sp\//.test(u),
    );
    return {
      sourceListingId: listingIdFromUrl(roomUrl),
      url: roomUrl,
      fields,
      imageUrls: [...new Set([...roomImages, ...bldgImages])],
    };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const dealType = /売|分譲/.test(f.種別 ?? "") ? "sale" : "rent";
    const price = parseYenWithSymbol(f.価格);
    if (price == null || price <= 0) throw new Error(`賃料/価格が解釈できない: ${f.価格}`);

    const title = f.建物名 || f.名称 || "";
    const stations = (f.最寄り駅 ?? f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const addressRaw = f.所在地 ?? f.住所 ?? "";
    const floorsLine = pickBuildingLine(f.階数, title);
    const structureLine = pickBuildingLine(f.構造, title);
    const builtLine = pickBuildingLine(f.竣工年月 ?? f.竣工, title);
    const featureText = [f.住戸内設備, f.施設, f.ペット, f.特徴].filter(Boolean).join("、");
    const direction = f.向き?.trim() || findDirection(featureText);
    const extraKeys = [
      "部屋番号",
      "間取り",
      "契約形態",
      "入居可能年月",
      "更新料",
      "総戸数",
      "耐震構造",
      "その他",
      "広告主",
    ];

    return {
      source: SOURCE,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType,
      title: title || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: parseFeeLoose(f["管理・共益費"] ?? f.管理費 ?? f.共益費),
      deposit: dealType === "rent" ? parseMonthsLoose(f.敷金, price) : null,
      keyMoney: dealType === "rent" ? parseMonthsLoose(f.礼金, price) : null,
      repairReserveFee: dealType === "sale" ? parseFeeLoose(f.修繕積立金) : null,
      layout: parseLayoutLoose(f.間取り),
      areaSqm: parseAreaSqm(f.専有面積),
      builtYearMonth: parseBuiltYearMonth(builtLine),
      floor: parseFloor((f.所在階 ?? "").replace(/^(\d+)F$/i, "$1階")).floor,
      totalFloors: parseTotalFloors(floorsLine),
      structure: parseMainStructure(structureLine),
      direction,
      features: [...new Set([...extractFeatures(featureText), ...directionFeatures(direction)])],
      transactionMode:
        f.取引態様 === "貸主" || f.取引態様 === "売主"
          ? "owner"
          : f.取引態様 === "代理"
            ? "agent"
            : f.取引態様
              ? "brokerage"
              : "unknown",
      adAllowed: null,
      agencyName: "森ビル",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: null,
      propertyType: "mansion",
      extra: Object.fromEntries(extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string])),
    };
  },
});
