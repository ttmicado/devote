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
import { addressInTowns, carryTowns, townsOf, withTowns } from "../../town-filter.js";
import { parseJpDate, parseStructure, parseTotalFloors } from "../rf12/helpers.js";

/**
 * 三菱地所ハウスネット（https://www.mec-h.com/rent）の賃貸。
 *
 * - 一覧・詳細ともに SSR → HTTP
 * - 一覧 /rent/list/building?todohuken_cd=13&shikugun_cd[]=13103 は建物単位で 30棟/ページ。
 *   各建物の下に空室が全件並ぶ（アコーディオンは表示の開閉だけ）。次ページは a.list-prev-next__btn.--next
 * - 詳細 /rent/detail/{物件コード}（例 H00907000066 / R3430621r602）。sourceListingId は物件コード
 * - 区単位の検索なので、中央区・江東区は一覧の所在地で勝どき・豊洲に絞る（town-filter）
 */
const BASE_URL = "https://www.mec-h.com";
const SOURCE_ID = "mec-h";

const WARDS: { key: string; code: string; towns?: string[] }[] = [
  { key: "minato", code: "13103" },
  { key: "shibuya", code: "13113" },
  { key: "chiyoda", code: "13101" },
  { key: "shinagawa", code: "13109" },
  { key: "chuo-kachidoki", code: "13102", towns: ["勝どき"] },
  { key: "koto-toyosu", code: "13108", towns: ["豊洲"] },
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
const squash = (s: string | undefined) => (s ?? "").replace(/[\s　]+/g, " ").trim();

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "三菱地所ハウスネット（賃貸）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "55 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: () =>
    WARDS.map((w) => ({
      key: w.key,
      params: { code: w.code, towns: (w.towns ?? []).join(",") },
    })),

  buildListUrl: (q) => {
    const p = new URLSearchParams({ todohuken_cd: "13" });
    p.append("shikugun_cd[]", String(q.params.code));
    const towns = String(q.params.towns ?? "")
      .split(",")
      .filter(Boolean);
    return withTowns(`${BASE_URL}/rent/list/building?${p}`, towns);
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const towns = townsOf(url);
    const items: ListItem[] = [];

    $("article.mod-property-card02").each((_, card) => {
      const $c = $(card);
      const address = squash($c.find(".mod-property-card02__detail-access p").first().text());
      if (towns && !addressInTowns(address, towns)) return;
      $c.find(".mod-property-card02__table-item").each((__, row) => {
        const $r = $(row);
        const href = $r.find('a[href*="/rent/detail/"]').first().attr("href");
        const id = href?.match(/\/rent\/detail\/([A-Za-z0-9]+)/)?.[1];
        if (!href || !id) throw new Error(`一覧の部屋行からリンクが取れない: ${squash($r.text())}`);
        // "33.4 万円(管理費 20,000円)" / "4階" / "1LDK / 47.27㎡" / "敷金/礼金1ヶ月 /-"
        const detailText = squash($r.find(".table-detail").text());
        const man = $r.find(".txt-num").first().text();
        items.push({
          sourceListingId: id,
          detailUrl: new URL(href, url).toString(),
          listHash: sha1(detailText),
          price: parseYen(`${man}万円`) ?? undefined,
        });
      });
    });

    const next = $("a.list-prev-next__btn.--next").first().attr("href");
    return {
      items,
      nextPageUrl: carryTowns(next ? new URL(next, url).toString() : null, url),
      // 表示の「該当物件数」は棟数なので、部屋数との照合には使えない
      totalCount: null,
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const id = new URL(url).pathname.match(/\/rent\/detail\/([A-Za-z0-9]+)\/?$/)?.[1];
    if (!id) throw new Error(`物件コードが URL から取れない: ${url}`);

    const fields: Record<string, string> = {};
    $("table.mod-property-overview th").each((_, th) => {
      const key = squash($(th).text()).replace(/\s/g, "");
      const td = $(th).next("td").clone();
      if (!key || td.length === 0) return;
      td.find("a").remove(); // 所在地の「地図・周辺情報」
      td.find("br").replaceWith("\n");
      fields[key] = td
        .text()
        .split("\n")
        .map((line) => squash(line))
        .filter(Boolean)
        .join("\n");
    });
    if (!fields.賃料) throw new Error(`物件概要の表が見つからない: ${url}`);
    fields.更新日 =
      $(".mod-property-overview__update dt")
        .filter((_, dt) => /^更新日/.test(squash($(dt).text())))
        .next("dd")
        .text()
        .trim() ?? "";

    // 写真: この物件のコードで始まるファイル（photo/…/{ID}.jpg, {ID}A.jpg … と madori/…/{ID}.jpg）だけ。
    // おすすめ物件の写真は除く
    const re = new RegExp(`/bkn_img/(?:photo|madori)/[^/]+/${id}[A-Z]?\\.(?:jpe?g|png|gif)$`, "i");
    const urls = new Set<string>();
    $("img[src]").each((_, img) => {
      const src = $(img).attr("src");
      if (src && re.test(src)) urls.add(new URL(src, url).toString());
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
    const direction = f.方位?.replace(/向き$/, "").replace(/^[-－ー]+$/, "") || null;

    const extraKeys = [
      "間取り詳細",
      "その他費用",
      "契約種類",
      "損害保険等",
      "更新料",
      "保証会社",
      "利用の制限",
      "総戸数",
      "駐車場",
      "入居時期",
      "備考",
    ];
    const extra: Record<string, string> = Object.fromEntries(
      extraKeys.filter((k) => f[k] && f[k] !== "-").map((k) => [k, f[k] as string]),
    );
    // "定期建物賃貸借\n（2年）" / "普通賃貸借 2年"。取り込み時の共通処理が読む名前にも入れる
    if (f.契約種類) extra.契約形態 = f.契約種類;

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: parseYen(f["管理費・共益費"]),
      deposit: parseMonthsOrYen(f.敷金, price),
      keyMoney: parseMonthsOrYen(f.礼金, price),
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm(f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor: parseFloor(f.所在階).floor,
      totalFloors: parseTotalFloors(f.建物規模),
      structure: parseStructure(f.建物構造),
      direction,
      features: [
        ...new Set([
          // 利用の制限は "ペット：相談可（小型犬…） 楽器：相談可 民泊：不可" の形。「ペット相談可」に寄せてから読む
          ...extractFeatures(
            [
              f["設備・その他"],
              f.利用の制限?.replace(/(ペット|楽器)\s*[:：]\s*/g, "$1"),
              f.備考,
            ].join("、"),
          ),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "三菱地所ハウスネット",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(f.更新日),
      repairReserveFee: null,
      propertyType: "mansion",
      extra,
    };
  },
});
