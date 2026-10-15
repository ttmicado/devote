import { createHash } from "node:crypto";
import {
  directionFeatures,
  extractFeatures,
  type NormalizedListingInput,
  parseAreaSqm,
  parseBuiltYearMonth,
  parseFloor,
  parseLayout,
  parseStationAccess,
  parseYen,
  type StationAccess,
  splitAddress,
  type TransactionMode,
} from "@devote/core";
import * as cheerio from "cheerio";
import { defineAdapter, type ListItem } from "../../adapter.js";
import { parseStructure, parseTotalFloors } from "../../helpers.js";
import { addressInTowns, carryTowns, townsOf, withTowns } from "../../town-filter.js";

/**
 * 住友不動産ステップ（https://www.stepon.co.jp/）の売買（中古マンション・中古一戸建て）。
 * 賃貸（stepon）とは画面の作りが違うので別のアダプターにしている。
 *
 * - 一覧・詳細ともに SSR。文字コードは Shift_JIS（取得側の decodeBody で復号する）
 * - 一覧 /mansion/area_13/list_13_103/（中古マンション）・/kodate/area_13/list_13_103/（一戸建て）。
 *   部屋（物件）単位で 30件/ページ、次ページは /30_N/。総件数は「該当件数」
 * - 詳細 /mansion/detail_{物件番号}/ ・ /kodate/detail_{物件番号}/。sourceListingId は物件番号（例 158P3027）
 * - 区単位の検索しかないため、中央区・江東区は一覧の所在地で勝どき・晴海・豊洲に絞る（town-filter）
 */
const BASE_URL = "https://www.stepon.co.jp";
const SOURCE_ID = "stepon-sale";

const WARDS: { key: string; code: string; towns?: string[] }[] = [
  { key: "minato", code: "13_103" },
  { key: "shibuya", code: "13_113" },
  { key: "chiyoda", code: "13_101" },
  { key: "shinagawa", code: "13_109" },
  { key: "chuo-kachidoki-harumi", code: "13_102", towns: ["勝どき", "晴海"] },
  { key: "koto-toyosu", code: "13_108", towns: ["豊洲"] },
];
const TYPES = ["mansion", "kodate"] as const;

const TRANSACTION_MODES: Record<string, TransactionMode> = {
  売主: "owner",
  代理: "agent",
  専属専任媒介: "exclusive_agency",
  専任媒介: "exclusive_agency",
  一般媒介: "general_agency",
  仲介: "brokerage",
  媒介: "brokerage",
};

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "住友不動産ステップ（売買）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "25 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: () =>
    TYPES.flatMap((type) =>
      WARDS.map((w) => ({
        key: `${type}-${w.key}`,
        params: { type, code: w.code, towns: (w.towns ?? []).join(",") },
      })),
    ),

  buildListUrl: (q) => {
    const towns = String(q.params.towns ?? "")
      .split(",")
      .filter(Boolean);
    return withTowns(`${BASE_URL}/${q.params.type}/area_13/list_${q.params.code}/`, towns);
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const towns = townsOf(url);
    const items: ListItem[] = [];

    $(".sr-card").each((_, el) => {
      const $el = $(el);
      const href = $el.find("a.sr-card__name").attr("href");
      const id = href?.match(/\/detail_([0-9A-Z]+)\/?$/)?.[1];
      if (!href || !id)
        throw new Error(`一覧の物件から物件番号/リンクが取れない: ${squash($el.text())}`);
      // "東京都港区白金１丁目" は .sr-card__text の最初のテキスト
      const address = squash($el.find(".sr-card__text").contents().first().text());
      if (towns && !addressInTowns(address, towns)) return;
      const price = squash($el.find(".sr-card__price").text()).replace(/\s/g, "");
      items.push({
        sourceListingId: id,
        detailUrl: new URL(href, url).toString(),
        listHash: sha1([price, squash($el.find(".sr-card__text").text())].join("|")),
        price: parseYen(price) ?? undefined,
      });
    });

    const next = $("a.pagination-button--next").first().attr("href");
    const total = $("#search-count-result").first().text().trim();
    return {
      items,
      nextPageUrl: carryTowns(next ? new URL(next, url).toString() : null, url),
      // 町名で絞った一覧は、表示の総件数（区全体）と件数が合わない
      totalCount: towns ? null : /^\d+$/.test(total) ? Number(total) : null,
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const m = new URL(url).pathname.match(/^\/(mansion|kodate)\/detail_([0-9A-Z]+)\/?$/);
    const id = m?.[2];
    if (!m || !id) throw new Error(`物件番号が URL から取れない: ${url}`);

    const fields: Record<string, string> = {};
    $("th").each((_, th) => {
      const key = squash($(th).text()).replace(/\s/g, "");
      const td = $(th).next("td");
      if (!key || td.length === 0 || fields[key] != null) return;
      const clone = td.clone();
      // 「地図を開く」「ローンシミュレーション」のリンク・ボタンだけ消す（駅名などのリンクは残す）
      clone
        .find("a, button")
        .filter((__, el) => /地図|シミュレーション/.test($(el).text()))
        .remove();
      clone.find("br").replaceWith("\n");
      fields[key] = clone
        .text()
        .split("\n")
        .map((line) => squash(line))
        .filter(Boolean)
        .join("\n");
    });
    if (!fields.価格) throw new Error(`物件概要の表が見つからない: ${url}`);
    fields.物件種別 = m[1] === "kodate" ? "一戸建て" : "マンション";

    // 写真: この物件のフォルダ（/pub/img/retail/{店舗}/{物件番号}/）の拡大画像だけ（おすすめ物件の写真は除く）
    const urls = new Set<string>();
    $("img[src], img[data-src], a[href]").each((_, el) => {
      const src = $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("href");
      if (!src?.includes(`/${id}/${id}_`) || !/_l\.(jpe?g|webp|png)$/i.test(src)) return;
      urls.add(new URL(src, url).toString());
    });

    return { sourceListingId: id, url, fields, imageUrls: [...urls] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const price = parseYen(f.価格?.split("\n")[0]?.replace(/\s/g, ""));
    if (price == null || price <= 0) throw new Error(`価格が解釈できない: ${f.価格}`);
    const house = f.物件種別 === "一戸建て";

    const addressRaw = (f.所在地 ?? "").split("\n")[0]?.replace(/\s+/g, "") ?? "";
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line.replace(/徒歩(\d+)\s*分/, "徒歩$1分")))
      .filter((s): s is StationAccess => s != null);
    // マンション "18階部分／地上45階地下1階建て\n鉄骨鉄筋コンクリート造" / 一戸建て "地上2階地下1階建て\n鉄筋コンクリート造"
    const floorStructure = f.所在階構造 ?? f.階数構造 ?? "";
    const [floorLine, structureLine] = floorStructure.split("\n");
    const direction = f.採光方向?.replace(/^[-－ー]+$/, "") || null;

    const extraKeys = [
      "バルコニー（テラス）面積",
      "土地面積",
      "総戸数",
      "管理形態管理方式管理会社",
      "新築時売主",
      "施工会社",
      "その他月額費用",
      "引渡時期",
      "現況",
      "駐車場",
      "土地権利",
      "地目地勢",
      "接道状況",
      "建ぺい率",
      "容積率",
      "用途地域",
      "備考",
    ];
    const extra = Object.fromEntries(extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string]));

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "sale",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: house ? null : parseYen(f["管理費(月額)"]),
      deposit: null,
      keyMoney: null,
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm(house ? f.建物面積 : f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor: house ? null : parseFloor(floorLine).floor,
      totalFloors: parseTotalFloors(floorLine),
      structure: parseStructure(structureLine ?? floorLine),
      direction,
      features: [
        ...new Set([
          ...extractFeatures([f.備考, f.駐車場 && !/無/.test(f.駐車場) ? "駐車場" : ""].join("、")),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "住友不動産ステップ",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: null,
      repairReserveFee: house ? null : parseYen(f["修繕積立金(月額)"]),
      propertyType: house ? "house" : "mansion",
      extra,
    };
  },
});
