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
import { defineAdapter, type ListItem, type SearchQuery } from "../../adapter.js";
import { parseJpDate, parseStructure, parseTotalFloors, withPrefecture } from "./helpers.js";

/**
 * ケン・コーポレーション（https://www.kencorp.co.jp/housing/）— 都心の高級賃貸・売買。
 * 賃貸（/housing/rent/）と売買（/housing/buy/）の両方を 1 アダプターで巡回する（dealType は詳細で判定）。
 *
 * - 検索結果ページは JS 描画（jQuery が /_api/search/result/ を叩いて描画）。
 *   一覧は内部 JSON API を直接取得する（ブラウザ不要。buildListUrl が API の URL を返し、parseList は JSON を読む）
 *   - search_type=rent|buy, search_by=district&districts=N（区）/ search_by=area&areas=XXX（エリア）
 *   - page / per_page は「建物」単位。各建物の properties に部屋（募集）が全件入る
 *   - bldg_count（建物数）と prop_count（部屋数）を返す。totalCount には prop_count を使う
 *   - 売買の price は万円単位、賃貸は円
 * - 詳細 /housing/properties/{建物コード}/{物件コード}/ は SSR。sourceListingId は物件コード（10桁）
 */
const BASE_URL = "https://www.kencorp.co.jp";
const SOURCE_ID = "kencorp";
const PER_PAGE = 50;

/** 区（districts）とエリア（areas）のコード。賃貸・売買で共通 */
const AREAS: { key: string; by: "district" | "area"; value: string }[] = [
  { key: "minato", by: "district", value: "12" },
  { key: "shibuya", by: "district", value: "2" },
  { key: "chiyoda", by: "district", value: "14" },
  { key: "shinagawa", by: "district", value: "17" },
  // 区単位だと広すぎる中央区・江東区はエリアで絞る（後段で isInTargetArea により勝どき・豊洲に絞る）
  { key: "tsukishima-kachidoki-harumi", by: "area", value: "ginwan01" },
  { key: "toyosu-ariake", by: "area", value: "ginwan02" },
];

const TRANSACTION_MODES: Record<string, TransactionMode> = {
  貸主: "owner",
  売主: "owner",
  代理: "agent",
  専属専任媒介: "exclusive_agency",
  専任媒介: "exclusive_agency",
  一般媒介: "general_agency",
  仲介: "brokerage",
  媒介: "brokerage",
};

interface ApiProperty {
  code: string;
  url: string;
  price: string | null;
  admin_cost?: string | null;
  layout?: string | null;
  footprint?: string | null;
  floor?: string | null;
  room?: string | null;
  pending?: string | null;
}
interface ApiResult {
  error_code: string;
  bldg_count: number;
  prop_count: number;
  buildings: { bldg_code: string; properties?: ApiProperty[] }[];
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const squash = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
/** "月額30,020円" → "30,020円" */
const stripMonthly = (s: string | undefined) => s?.replace(/月額|\(.*?\)|（.*?）/g, "");
/** "A / B" 形式の値を分割 */
const splitPair = (s: string | undefined): [string | undefined, string | undefined] => {
  const [a, b] = (s ?? "").split(/\s*[／/]\s*/);
  return [a?.trim() || undefined, b?.trim() || undefined];
};

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "ケン・コーポレーション",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2000, maxConcurrency: 1 },
    schedule: { listCron: "30 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: (): SearchQuery[] =>
    (["rent", "buy"] as const).flatMap((type) =>
      AREAS.map((a) => ({
        key: `${type}-${a.key}`,
        params: { search_type: type, search_by: a.by, value: a.value },
      })),
    ),

  buildListUrl: (q) => {
    const by = String(q.params.search_by);
    const qs = new URLSearchParams({
      search_type: String(q.params.search_type),
      search_by: by,
      [by === "district" ? "districts" : "areas"]: String(q.params.value),
      page: "1",
      per_page: String(PER_PAGE),
    });
    return `${BASE_URL}/_api/search/result/?${qs}`;
  },

  parseList(body, url) {
    let data: ApiResult;
    try {
      data = JSON.parse(body) as ApiResult;
    } catch {
      throw new Error(`検索APIの応答が JSON でない: ${url} ${body.slice(0, 200)}`);
    }
    if (data.error_code) throw new Error(`検索APIエラー ${data.error_code}: ${url}`);
    if (!Array.isArray(data.buildings)) throw new Error(`検索APIの応答に buildings がない: ${url}`);

    const u = new URL(url);
    const isSale = u.searchParams.get("search_type") === "buy";
    const items: ListItem[] = data.buildings.flatMap((b) =>
      (b.properties ?? []).map((p) => {
        if (!p.code || !p.url) throw new Error(`物件コード/URL が取れない: ${JSON.stringify(p)}`);
        const raw = p.price != null && /^\d+(\.\d+)?$/.test(p.price) ? Number(p.price) : null;
        return {
          sourceListingId: p.code,
          detailUrl: new URL(p.url, BASE_URL).toString(),
          listHash: sha1(
            [p.price, p.admin_cost, p.layout, p.footprint, p.floor, p.room, p.pending].join("|"),
          ),
          price: raw == null ? undefined : Math.round(isSale ? raw * 10_000 : raw),
        };
      }),
    );

    const page = Number(u.searchParams.get("page") ?? "1");
    const perPage = Number(u.searchParams.get("per_page") ?? PER_PAGE);
    let nextPageUrl: string | null = null;
    if (data.buildings.length > 0 && page * perPage < data.bldg_count) {
      u.searchParams.set("page", String(page + 1));
      nextPageUrl = u.toString();
    }
    return { items, nextPageUrl, totalCount: data.prop_count ?? null };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const id =
      new URL(url).pathname.match(/\/properties\/\d+\/(\d+)\/?$/)?.[1] ??
      $(".main.co-ho-pr").attr("data-code");
    if (!id) throw new Error(`物件コードが取れない: ${url}`);

    const fields: Record<string, string> = {};
    $(".co-014_04__table tr, .co-014__table tr").each((_, tr) => {
      const th = $(tr).children("th").first();
      const td = $(tr).children("td").first();
      const key = squash(th.text()).replace(/\s/g, "");
      if (!key || td.length === 0) return;
      td.find("p:has(a), a.co-031_03__link").remove(); // ローンシミュレーション・通学経路などのリンク
      td.find("br").replaceWith("\n");
      fields[key] = td
        .text()
        .split("\n")
        .map((line) => squash(line))
        .filter(Boolean)
        .join("\n");
    });
    if (!fields.賃料 && !fields["賃料/管理費"] && !fields.価格) {
      throw new Error(`物件情報テーブルに賃料/価格がない: ${url}`);
    }

    const heading = squash($(".co-011_01__main-title").first().text());
    fields.見出し = heading;
    // "テラス神田猿楽町  3階 2LDK" / "恵比寿3丁目一戸建 2LDK+S" → 建物名
    fields.建物名 = heading
      .replace(/\s+\d+(?:[SLDKR]+|ルーム)[^\s]*$/i, "")
      .replace(/\s+(?:地下)?\d+階$/, "")
      .trim();
    fields.種別タグ = squash($(".co-014_04__head-tag").first().text());

    const urls: string[] = [];
    $(".co-022_02__sliderItem").each((_, li) => {
      const img = $(li).find("img").not(".housing-detail-search-icon").first();
      const src = img.attr("data-lazy") || img.attr("data-src") || img.attr("src");
      if (src && !src.startsWith("data:")) urls.push(new URL(src, url).toString());
    });

    return { sourceListingId: id, url, fields, imageUrls: [...new Set(urls)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const isSale = f.価格 != null || f.種別タグ === "売買";

    let price: number | null;
    let managementFee: number | null;
    let repairReserveFee: number | null = null;
    let deposit: number | null = null;
    let keyMoney: number | null = null;
    if (isSale) {
      price = parseYen(f.価格?.split("\n")[0]);
      managementFee = parseYen(stripMonthly(f.管理費));
      repairReserveFee = parseYen(stripMonthly(f.修繕積立金));
    } else {
      const [rentText, feeText] = f["賃料/管理費"]
        ? splitPair(f["賃料/管理費"])
        : [f.賃料, f.管理費];
      price = parseYen(rentText);
      managementFee = parseYen(stripMonthly(feeText));
    }
    if (price == null || price <= 0) {
      throw new Error(`${isSale ? "価格" : "賃料"}が解釈できない: ${f.価格 ?? f["賃料/管理費"]}`);
    }
    if (!isSale) {
      const [depositText, keyMoneyText] = splitPair(f["敷金/礼金"]);
      deposit = parseMonthsOrYen(depositText, price);
      keyMoney = parseMonthsOrYen(keyMoneyText, price);
    }

    const [layoutText, directionText] = f["間取り/方位"] ? splitPair(f["間取り/方位"]) : [f.間取り];
    const direction = directionText?.replace(/^[-－ー]$/, "") || null;
    const [totalText, floorText] = f["階建/所在階"] ? splitPair(f["階建/所在階"]) : [f.階建];
    const [structureText] = f["構造/総戸数"] ? splitPair(f["構造/総戸数"]) : [f.構造];

    const propertyType = f.専有面積
      ? "mansion"
      : f.延床面積
        ? "house"
        : f.土地面積 || f.地目
          ? "land"
          : isSale
            ? "other"
            : "mansion";
    const areaSqm = parseAreaSqm(
      f.専有面積 ?? f.延床面積 ?? f.土地面積 ?? f.敷地面積?.replace(/^公簿面積/, ""),
    );

    const stations = (f["交通/駅徒歩*"] ?? f["交通/駅徒歩"] ?? f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const addressRaw = withPrefecture(f.住所 ?? "");

    const featureText = [f.特徴, f.部屋設備, f["建物設備・施設"], f.入居諸条件].join("、");

    const extraKeys = [
      "見出し",
      "償却/更新料",
      "契約形態",
      "契約期間（期日）",
      "入居可能日",
      "入居諸条件",
      "バルコニー関連",
      "その他費用",
      "敷地権利",
      "敷地面積",
      "土地面積",
      "現況",
      "引渡時期",
      "施工業者",
      "分譲会社",
      "管理会社",
      "管理/勤務形態",
      "駐車場",
      "用途地域",
      "建蔽率",
      "容積率",
      "地目",
      "接面道路",
      "構造/総戸数",
      "次回更新予定日",
    ];
    const extra = Object.fromEntries(extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string]));

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: isSale ? "sale" : "rent",
      title: f.建物名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee,
      deposit,
      keyMoney,
      layout: parseLayout(layoutText),
      areaSqm,
      builtYearMonth: parseBuiltYearMonth(f.竣工 ?? f.築年月),
      floor: floorText ? parseFloor(floorText).floor : null,
      totalFloors: parseTotalFloors(totalText),
      structure: parseStructure(structureText),
      direction,
      features: [...new Set([...extractFeatures(featureText), ...directionFeatures(direction)])],
      transactionMode: TRANSACTION_MODES[f.取引形態?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "ケン・コーポレーション",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(f.情報更新日),
      repairReserveFee,
      propertyType,
      extra,
    };
  },
});
