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
 * 三菱地所ハウスネット（https://www.mec-h.com/）の売買（中古マンション・中古一戸建）。
 * 賃貸（mec-h）は建物単位の一覧だが、売買は物件（部屋）単位の一覧なので別のアダプターにしている。
 *
 * - 一覧・詳細ともに SSR → HTTP
 * - 一覧 /buy/list?todohuken_cd=13&shikugun_cd[]=13103（マンション。売地も混ざるので読み飛ばす）・/house/list?…（一戸建）。
 *   30件/ページ、次ページは a.list-prev-next__btn.--next。総件数は「該当物件数」。
 *   おすすめ物件（.mod-recommend-card）は一覧の物件ではないので読まない
 * - 詳細 /mansion/detail/{物件コード} ・ /house/detail/{物件コード}。sourceListingId は物件コード
 * - 区単位の検索なので、中央区・江東区は一覧の所在地で勝どき・晴海・豊洲に絞る（town-filter）
 */
const BASE_URL = "https://www.mec-h.com";
const SOURCE_ID = "mec-h-sale";

const WARDS: { key: string; code: string; towns?: string[] }[] = [
  { key: "minato", code: "13103" },
  { key: "shibuya", code: "13113" },
  { key: "chiyoda", code: "13101" },
  { key: "shinagawa", code: "13109" },
  { key: "chuo-kachidoki-harumi", code: "13102", towns: ["勝どき", "晴海"] },
  { key: "koto-toyosu", code: "13108", towns: ["豊洲"] },
];
/** 一覧のパス: マンション /buy/list、一戸建 /house/list */
const TYPES = [
  { key: "mansion", path: "buy" },
  { key: "house", path: "house" },
] as const;

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
const squash = (s: string | undefined) => (s ?? "").replace(/[\s　]+/g, " ").trim();

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "三菱地所ハウスネット（売買）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "5 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "2",
  },

  queries: () =>
    TYPES.flatMap((t) =>
      WARDS.map((w) => ({
        key: `${t.key}-${w.key}`,
        params: { path: t.path, code: w.code, towns: (w.towns ?? []).join(",") },
      })),
    ),

  buildListUrl: (q) => {
    const p = new URLSearchParams({ todohuken_cd: "13" });
    p.append("shikugun_cd[]", String(q.params.code));
    const towns = String(q.params.towns ?? "")
      .split(",")
      .filter(Boolean);
    return withTowns(`${BASE_URL}/${q.params.path}/list?${p}`, towns);
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const towns = townsOf(url);
    const items: ListItem[] = [];
    // 1行の解釈失敗でソース全体を止めない。想定外の行は skipped に入れて返す（ランナーが一覧を不完全として扱う）
    const skipped: string[] = [];

    $("article.mod-property-card").each((_, card) => {
      const $c = $(card);
      const href = $c.find("a.mod-property-card__grid").attr("href");
      // マンションの一覧には売地（/land/detail/…）が混ざる。住まいではないので対象外（黙って除外）
      if (href && /\/land\/detail\//.test(href)) return;
      // "港区南青山６丁目"
      const address = squash($c.find(".mod-property-card__detail-access p").first().text());
      // 対象の町の外の行は、解釈できなくても一覧の完全さに関係しないので先に落とす
      if (towns && !addressInTowns(address, towns)) return;
      const id = href?.match(/\/(?:mansion|house)\/detail\/([A-Za-z0-9]+)/)?.[1];
      if (!href || !id) {
        skipped.push(`${href ?? squash($c.text()).slice(0, 60)}: 物件のリンクが取れない`);
        return;
      }
      const man = $c.find(".mod-property-card__price .num").first().text();
      items.push({
        sourceListingId: id,
        detailUrl: new URL(href, url).toString(),
        listHash: sha1(squash($c.find(".mod-property-card__info").text())),
        price: parseYen(`${man}万円`) ?? undefined,
      });
    });

    const next = $("a.list-prev-next__btn.--next").first().attr("href");
    const hit = $(".mod-list-result__num-hit").first().text().trim();
    return {
      items,
      nextPageUrl: carryTowns(next ? new URL(next, url).toString() : null, url),
      // 町名で絞った一覧と、売地が混ざるマンションの一覧（/buy/list）は、表示の件数と合わない
      totalCount:
        towns || new URL(url).pathname.startsWith("/buy/")
          ? null
          : /^\d+$/.test(hit)
            ? Number(hit)
            : null,
      ...(skipped.length > 0 ? { skipped } : {}),
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const m = new URL(url).pathname.match(/^\/(mansion|house)\/detail\/([A-Za-z0-9]+)\/?$/);
    const id = m?.[2];
    if (!m || !id) throw new Error(`物件コードが URL から取れない: ${url}`);

    const fields: Record<string, string> = {};
    $("table.mod-property-overview th").each((_, th) => {
      const key = squash($(th).text()).replace(/\s/g, "");
      const td = $(th).next("td").clone();
      if (!key || td.length === 0 || fields[key] != null) return;
      // 「地図・周辺情報」のリンクだけ消す（区名・路線・駅名もリンクなので残す）
      td.find("a.cmn-txt-link").remove();
      td.find("br").replaceWith("\n");
      fields[key] = td
        .text()
        .split("\n")
        .map((line) => squash(line))
        .filter(Boolean)
        .join("\n");
    });
    if (!fields.価格) throw new Error(`物件概要の表が見つからない: ${url}`);
    fields.物件種別 = m[1] === "house" ? "一戸建" : "マンション";
    if (!fields.物件名) {
      // 一戸建は物件名の行が無い。<title>「【…】渋谷区富ヶ谷２丁目の一戸建て（D12X31185）｜…」から取る
      fields.物件名 = squash($("title").text()).match(/】(.+?)（[A-Za-z0-9]+）/)?.[1] ?? "";
    }

    // 写真: この物件コードで始まるファイル（photo/…/{ID}.jpg, {ID}A.jpg … と madori/…/{ID}.jpg）だけ
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
    const price = parseYen(f.価格?.split("\n")[0]?.replace(/\s/g, ""));
    if (price == null || price <= 0) throw new Error(`価格が解釈できない: ${f.価格}`);
    const house = f.物件種別 === "一戸建";

    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const direction = f.方位?.replace(/向き$/, "").replace(/^[-－ー]+$/, "") || null;
    const perMonth = (s: string | undefined) => parseYen(s?.replace(/／月$/, ""));

    const extraKeys = [
      "その他費用",
      "その他面積",
      "土地面積",
      "私道面積",
      "間取り詳細",
      "駐車場",
      "総戸数",
      "管理会社",
      "管理形態",
      "施工会社",
      "分譲会社",
      "用途地域",
      "接道方向",
      "建ぺい率／容積率",
      "現況",
      "引渡し",
      "土地権利",
    ];
    const extra: Record<string, string> = Object.fromEntries(
      extraKeys.filter((k) => f[k] && f[k] !== "-").map((k) => [k, f[k] as string]),
    );
    // 取り込み時の共通処理が読む名前にも入れる
    if (f.引渡し) extra.引渡時期 = f.引渡し;

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "sale",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: house ? null : perMonth(f.管理費),
      deposit: null,
      keyMoney: null,
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm((house ? f.建物面積 : f.専有面積)?.split("\n")[0]),
      builtYearMonth: parseBuiltYearMonth(f.建築時期),
      floor: house ? null : parseFloor(f.所在階).floor,
      totalFloors: parseTotalFloors(f.階層),
      structure: parseStructure(f.構造),
      direction,
      features: [
        ...new Set([
          ...extractFeatures([f.備考, f.駐車場 && /^有/.test(f.駐車場) ? "駐車場" : ""].join("、")),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "三菱地所ハウスネット",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: null,
      repairReserveFee: house ? null : perMonth(f.修繕積立金),
      propertyType: house ? "house" : "mansion",
      extra,
    };
  },
});
