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
import { addressInTowns, carryTowns, townsOf, withTowns } from "../../town-filter.js";
import { parseJpDate, parseStructure } from "../rf12/helpers.js";

/**
 * 住友不動産ステップ（https://www.stepon.co.jp/chintai/）— 住友不動産販売の仲介ブランド。賃貸の一覧・詳細。
 *
 * - 一覧・詳細ともに SSR。文字コードは Shift_JIS（取得側の decodeBody で復号する）
 * - 一覧 /chintai/search/list/?type=mansion&prefCd=13&isDesignated=on&searchType=area&prefCityCd=13_103
 *   は部屋単位。limit=50 で 50件/ページ、「次へ」で pageNo=N。総件数は「N件中」
 * - 種別は mansion（マンション・アパート）と kodate（一戸建て・テラスハウス）。戸建ては件数が少ないので区をまとめて1検索
 * - 詳細 /chintai/detail/{物件番号}/。sourceListingId は物件番号（例 162UA980）
 * - 区単位の検索しかないため、中央区・江東区は一覧の所在地で勝どき・豊洲に絞る（town-filter）
 */
const BASE_URL = "https://www.stepon.co.jp";
const SOURCE_ID = "stepon";

const WARDS: { key: string; code: string; towns?: string[] }[] = [
  { key: "minato", code: "13_103" },
  { key: "shibuya", code: "13_113" },
  { key: "chiyoda", code: "13_101" },
  { key: "shinagawa", code: "13_109" },
  { key: "chuo-kachidoki", code: "13_102", towns: ["勝どき"] },
  { key: "koto-toyosu", code: "13_108", towns: ["豊洲"] },
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

/** "760,000円／2ヶ月" → 円の側。"なし" → 0 */
const yenPart = (s: string | undefined) => parseYen(s?.split(/[／/]/)[0]);

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "住友不動産ステップ（賃貸）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "25 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: () => [
    ...WARDS.map((w) => ({
      key: `mansion-${w.key}`,
      params: { type: "mansion", wards: w.code, towns: (w.towns ?? []).join(",") },
    })),
    {
      key: "kodate",
      params: {
        type: "kodate",
        wards: WARDS.filter((w) => !w.towns)
          .map((w) => w.code)
          .join(","),
        towns: "",
      },
    },
  ],

  buildListUrl: (q) => {
    const p = new URLSearchParams({
      type: String(q.params.type),
      prefCd: "13",
      isDesignated: "on",
      searchType: "area",
    });
    for (const code of String(q.params.wards).split(",")) p.append("prefCityCd", code);
    p.set("limit", "50");
    const towns = String(q.params.towns ?? "")
      .split(",")
      .filter(Boolean);
    return withTowns(`${BASE_URL}/chintai/search/list/?${p}`, towns);
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const towns = townsOf(url);
    const items: ListItem[] = [];

    $(".resultItem").each((_, el) => {
      const $el = $(el);
      const id = $el.find("input[name=bukken_no]").attr("value");
      const href = $el.find("h2.txt a[href]").attr("href");
      if (!id || !href)
        throw new Error(`一覧の物件から物件番号/リンクが取れない: ${squash($el.text())}`);
      const doc: Record<string, string> = {};
      $el.find(".doc dl").each((__, dl) => {
        doc[squash($(dl).find("dt").text())] = squash($(dl).find("dd").text());
      });
      if (towns && !addressInTowns(doc.所在地 ?? "", towns)) return;
      items.push({
        sourceListingId: id,
        detailUrl: new URL(href, url).toString(),
        listHash: sha1(
          [doc.賃料, doc.共益費等, doc["間取り/専有面積"], squash($el.find(".lead").text())].join(
            "|",
          ),
        ),
        price: parseYen(doc.賃料) ?? undefined,
      });
    });

    const next = $(".pagenationBlock.topBlock a")
      .filter((_, a) => squash($(a).text()) === "次へ")
      .first()
      .attr("href");
    const total = $(".pagenationBlock.topBlock .numDisplay em span").first().text();
    return {
      items,
      nextPageUrl: carryTowns(next ? new URL(next, url).toString() : null, url),
      // 町名で絞った一覧は、表示の総件数（区全体）と件数が合わない
      totalCount: towns ? null : /^\d+$/.test(total) ? Number(total) : null,
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const id = new URL(url).pathname.match(/\/chintai\/detail\/([0-9A-Z]+)\/?$/)?.[1];
    if (!id) throw new Error(`物件番号が URL から取れない: ${url}`);

    const fields: Record<string, string> = {};
    $("#detailBlock table th").each((_, th) => {
      const key = squash($(th).text()).replace(/\s/g, "");
      const td = $(th).next("td");
      if (!key || td.length === 0) return;
      td.find("br").replaceWith("\n");
      td.find("div").remove(); // 間取りの「※Ｓはサービスルーム（納戸）」
      fields[key] = td
        .text()
        .split("\n")
        .map((line) => squash(line))
        .filter(Boolean)
        .join("\n");
    });
    if (!fields.賃料) throw new Error(`物件詳細テーブルが見つからない: ${url}`);

    // <title>ワールドシティタワーズキャピタルタワー（162UA980）｜賃貸マンション｜…
    const title = squash($("title").text());
    const name = title.match(/^(.+?)（[0-9A-Z]+）/)?.[1];
    if (name) fields.物件名 = name;
    fields.物件種別 = /賃貸一戸建て/.test(title) ? "一戸建て" : "マンション";
    fields.情報日付 =
      $("#detailBlock .caption")
        .text()
        .match(/(\d{4}年\d{1,2}月\d{1,2}日)/)?.[1] ?? "";
    fields.特徴 = squash($(".lead").first().text());

    // 写真: この物件のフォルダ（/pub/img/retail/{店舗}/{物件番号}/）の拡大画像だけ。おすすめ物件の写真は除く
    const urls = new Set<string>();
    $("img[src], a[url]").each((_, el) => {
      const src = $(el).attr("src") ?? $(el).attr("url");
      if (!src?.includes(`/${id}/${id}_`)) return;
      // サムネイル "162UA980_2.jpg" と拡大 "162UA980_2_l.jpg" が並ぶので拡大に寄せる
      const large = /_l\.jpg$/.test(src) ? src : src.replace(/\.jpg$/, "_l.jpg");
      urls.add(new URL(large, url).toString());
    });

    return { sourceListingId: id, url, fields, imageUrls: [...urls] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const price = parseYen(f.賃料);
    if (price == null || price <= 0) throw new Error(`賃料が解釈できない: ${f.賃料}`);

    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    // "39階部分／地上42階地下2階建て・ＲＣ造" / "地上3階建て・木造"（戸建ては所在階なし）
    const [floorPart, structurePart] = (f["所在階・構造"] ?? "").split(/[・･]/);
    const { floor, totalFloors } = parseFloor(floorPart);
    const direction = f.採光方向?.replace(/^[-－ー]+$/, "") || null;
    const house = f.物件種別 === "一戸建て";

    const extraKeys = [
      "間取内訳",
      "保証金",
      "権利金",
      "解約引",
      "その他一時費用",
      "契約形態",
      "契約期間",
      "更新料",
      "現況",
      "入居時期",
      "駐車場",
      "損害保険",
      "備考",
      "特徴",
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
      managementFee: parseYen(f.共益費等),
      deposit: yenPart(f.敷金),
      keyMoney: yenPart(f.礼金),
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm(f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor: house ? null : floor,
      totalFloors: totalFloors ?? parseFloor(f["所在階・構造"]).totalFloors,
      structure: parseStructure(structurePart ?? f["所在階・構造"]),
      direction,
      features: [
        ...new Set([
          ...extractFeatures([f["設備・条件"], f.特徴, f.備考].join("、")),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "住友不動産ステップ",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(f.情報日付),
      repairReserveFee: null,
      propertyType: house ? "house" : "mansion",
      extra,
    };
  },
});
