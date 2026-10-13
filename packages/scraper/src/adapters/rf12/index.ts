import { createHash } from "node:crypto";
import {
  directionFeatures,
  extractFeatures,
  type NormalizedListingInput,
  parseAreaSqm,
  parseBuiltYearMonth,
  parseFloor,
  parseLayout,
  parseMonthsOrYen,
  parseStationAccess,
  parseYen,
  type StationAccess,
  splitAddress,
  type TransactionMode,
} from "@devote/core";
import * as cheerio from "cheerio";
import { defineAdapter, type ListItem } from "../../adapter.js";
import { parseJpDate, parseMonths, parseStructure, parseTotalFloors } from "./helpers.js";

/**
 * REIT FIND（https://rf12.jp/）— 株式会社SOLPIR が運営する、REIT系・ブランド賃貸マンション専門の
 * 賃貸仲介サイト。売買の掲載はない（賃貸のみ）。
 *
 * - 一覧・詳細ともに SSR（jQuery は並べ替え等の補助のみ）→ fetchMode は http
 * - 一覧 /list/?city[]=N は「建物」単位で 50 棟/ページ。各建物の下に空室（部屋）が全件並ぶ（tr.room-row）
 * - 詳細は部屋単位 /building/{建物ID}/{部屋ID}/。sourceListingId は部屋ID
 * - 一覧は空室のある建物が先、空室0の建物が後ろに並ぶ。空室0の建物が出たページで巡回を打ち切る
 */
const BASE_URL = "https://rf12.jp";
const SOURCE_ID = "rf12";

/** 区の city コード（サイト独自）。中央区・江東区は町名（town コード）で絞る */
const AREA_QUERIES: { key: string; params: Record<string, string> }[] = [
  { key: "minato", params: { "city[]": "1" } },
  { key: "shibuya", params: { "city[]": "4" } },
  { key: "chiyoda", params: { "city[]": "9" } },
  { key: "shinagawa", params: { "city[]": "8" } },
  { key: "chuo-kachidoki", params: { "town[]": "131020003" } },
  { key: "koto-toyosu", params: { "town[]": "131080032" } },
];

const TRANSACTION_MODES: Record<string, TransactionMode> = {
  貸主: "owner",
  代理: "agent",
  専属専任媒介: "exclusive_agency",
  専任媒介: "exclusive_agency",
  一般媒介: "general_agency",
  仲介: "brokerage",
  媒介: "brokerage",
};

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** 「可」「相談」なら true（「不可」は false） */
const allowed = (s: string | undefined) => !!s && /可|相談/.test(s) && !/不可/.test(s);

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "REIT FIND（rf12.jp）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2000, maxConcurrency: 1 },
    schedule: { listCron: "15 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: () => AREA_QUERIES,

  buildListUrl: (q) => {
    const qs = Object.entries(q.params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `${BASE_URL}/list/?${qs}`;
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const items: ListItem[] = [];
    let sawEmptyBuilding = false;

    $("section.searchList").each((_, sec) => {
      const $sec = $(sec);
      const vacancy = $sec
        .find(".searchListView .textCount")
        .toArray()
        .map((el) => $(el).text())
        .find((t) => /募集中/.test(t));
      const rooms = $sec.find("tr.room-row");
      if (vacancy && /^\s*0室/.test(vacancy) && rooms.length === 0) sawEmptyBuilding = true;

      rooms.each((__, tr) => {
        const $tr = $(tr);
        const id = $tr.attr("data-room_id");
        const href = $tr.attr("data-href");
        if (!id || !href) throw new Error(`一覧の部屋行から ID/リンクが取れない: ${$tr.html()}`);
        const rentAttr = $tr.attr("data-rent");
        const rentText = squash($tr.find("td.rent").text());
        items.push({
          sourceListingId: id,
          detailUrl: new URL(href, url).toString(),
          listHash: sha1(
            [
              rentText,
              squash($tr.find("td.deposit").text()),
              squash($tr.find("td.brokerage").text()),
              squash($tr.find("td.freerent").text()),
              squash($tr.find(".room-data").text()),
            ].join("|"),
          ),
          price: rentAttr && /^\d+$/.test(rentAttr) ? Number(rentAttr) : undefined,
        });
      });
    });

    // 空室0の建物が出たら以降のページも空室0（空室あり→なしの順に並ぶ）なので打ち切る
    const next = sawEmptyBuilding ? undefined : $(".pagenum_a li.next a").first().attr("href");
    const total = $("#searchInfo")
      .text()
      .match(/部屋数\s*([\d,]+)\s*室/);
    return {
      items,
      nextPageUrl: next ? new URL(next, url).toString() : null,
      totalCount: total?.[1] ? Number(total[1].replace(/,/g, "")) : null,
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const m = new URL(url).pathname.match(/\/building\/(\d+)\/(\d+)\/?$/);
    if (!m?.[2]) throw new Error(`部屋IDが URL から取れない: ${url}`);

    const fields: Record<string, string> = {};
    $("#outline table tr").each((_, tr) => {
      $(tr)
        .children("th")
        .each((__, th) => {
          const key = squash($(th).text()).replace(/\s/g, "");
          const td = $(th).next("td");
          if (!key || td.length === 0) return;
          td.find("br").replaceWith("\n");
          fields[key] = td
            .text()
            .split("\n")
            .map((line) => squash(line))
            .filter(Boolean)
            .join("\n");
        });
    });
    if (!fields.賃料) throw new Error(`物件概要テーブルが見つからない: ${url}`);

    // 見出し "コートモデリア六本木 103" から部屋番号
    const heading = squash($("#pagetitle-room h2").clone().children().remove().end().text());
    const roomNo = heading.match(/\s(\S+)$/)?.[1];
    if (roomNo) fields.部屋番号 = roomNo;
    fields.建物ID = m[1] ?? "";
    fields.部屋設備 = $("#room-facilities img[alt]")
      .toArray()
      .map((el) => $(el).attr("alt"))
      .join("、");
    fields.建物設備 = $("#facilities img[alt]")
      .toArray()
      .map((el) => $(el).attr("alt"))
      .join("、");
    fields.キャンペーン = $("#campArea li")
      .toArray()
      .map((el) => squash($(el).text()))
      .join("、");

    // 写真: 建物写真（外観・共用部・室内の各カテゴリ）＋間取り図。
    // JS 無効時用の <noscript> 内にも同じ一覧があるので、そちらも拾って重複を除く。
    const urls: string[] = [];
    const push = (src: string | undefined) => {
      if (!src || src.startsWith("data:") || !/\/images\/(estate|room)\//.test(src)) return;
      urls.push(new URL(src, url).toString());
    };
    $("#link_imagelist a[href]").each((_, a) => push($(a).attr("href")));
    $("#link_imagelist noscript").each((_, ns) => {
      const $ns = cheerio.load($(ns).text() || $(ns).html() || "");
      $ns("a[href]").each((__, a) => push($ns(a).attr("href")));
    });
    if (urls.length === 0) {
      $("#link_imagearea img").each((_, img) => push($(img).attr("src")));
    }
    $("#planImg a[href]").each((_, a) => push($(a).attr("href")));

    return { sourceListingId: m[2], url, fields, imageUrls: [...new Set(urls)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const price = parseYen(f.賃料);
    if (price == null || price <= 0) throw new Error(`賃料が解釈できない: ${f.賃料}`);

    const [depositText, keyMoneyText] = (f["敷金/礼金"] ?? "").split(/[／/]/);
    const [floorText, directionText] = (f["所在階/向き"] ?? "").split(/[／/]/);
    const direction = directionText?.trim().replace(/^[-－ー]$/, "") || null;
    const stations = (f.最寄駅 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");

    const featureText = [
      f.部屋設備,
      f.建物設備,
      f.物件特徴,
      f.キャンペーン,
      allowed(f.ペット飼育) ? "ペット可" : "",
      allowed(f["SOHO・事務所"]) ? "事務所可" : "",
      (parseMonths(f.フリーレント) ?? 0) > 0 ? "フリーレント" : "",
    ].join("、");

    const extraKeys = [
      "部屋番号",
      "建物ID",
      "総戸数",
      "部屋詳細",
      "仲介手数料",
      "フリーレント",
      "更新料",
      "契約形態",
      "保証会社",
      "ペット飼育",
      "SOHO・事務所",
      "入居日",
      "問合番号",
      "キャンペーン",
    ];
    const extra = Object.fromEntries(extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string]));

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: parseYen(f.管理費),
      deposit: parseMonthsOrYen(depositText, price),
      keyMoney: parseMonthsOrYen(keyMoneyText, price),
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm(f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor: parseFloor(floorText).floor,
      totalFloors: parseTotalFloors(f.構造規模),
      structure: parseStructure(f.構造規模),
      direction,
      features: [...new Set([...extractFeatures(featureText), ...directionFeatures(direction)])],
      transactionMode: TRANSACTION_MODES[f.取引形態?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "株式会社SOLPIR（REIT FIND）",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(f.情報更新日),
      repairReserveFee: null,
      propertyType: "mansion",
      extra,
    };
  },
});
