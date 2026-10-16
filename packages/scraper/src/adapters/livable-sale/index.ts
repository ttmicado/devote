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
import {
  accessLines,
  getOk,
  htmlText,
  type LivableDetail,
  nextDataProps,
  originalImage,
  pick,
  squash,
} from "../livable/index.js";

/**
 * 東急リバブル（https://www.livable.co.jp/kounyu/）の売買（マンション・一戸建て）。
 *
 * - 一覧は賃貸と同じ作り（Next.js の __NEXT_DATA__）。/kounyu/mansion/tokyo/{エリア}/?sort=address&page=N、
 *   /kounyu/kodate/tokyo/{エリア}/。30件/ページ。エリアは区（a13103）か町（t13102003 = 勝どき）
 * - 詳細は2種類:
 *   - 通常: /mansion/{物件番号}/ ・ /kodate/{物件番号}/（__NEXT_DATA__ の summary.tableItems）→ JSON にして渡す
 *   - 高級物件ブランド GRANTACT: /grantact/detail/{物件番号}（SSR の表）→ HTML のまま渡す
 * - sourceListingId は詳細URLの物件番号（例 C13262R30）。一覧の propertyCd とは違うことがある（GRANTACT は M…）
 */
const BASE_URL = "https://www.livable.co.jp";
const SOURCE_ID = "livable-sale";
const PAGE_SIZE = 30;

const AREAS: { key: string; path: string }[] = [
  { key: "minato", path: "a13103" },
  { key: "shibuya", path: "a13113" },
  { key: "chiyoda", path: "a13101" },
  { key: "shinagawa", path: "a13109" },
  { key: "chuo-kachidoki", path: "t13102003" },
  { key: "chuo-harumi", path: "t13102034" },
  { key: "koto-toyosu", path: "t13108030" },
];
const TYPES = ["mansion", "kodate"] as const;

const TRANSACTION_MODES: [RegExp, TransactionMode][] = [
  [/売主/, "owner"],
  [/代理/, "agent"],
  [/専属専任|専任/, "exclusive_agency"],
  [/一般/, "general_agency"],
  [/仲介|媒介/, "brokerage"],
];

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

interface SaleListProperty {
  propertyCd?: string;
  detailUrl?: string;
  priceModel?: { price?: number };
  propertyDetail?: string[];
}

/** 詳細URL → [種類, 物件番号]（/mansion/C13262R30/ ・ /kodate/C48268E83/ ・ /grantact/detail/C48266B42） */
function detailKey(url: string): ["mansion" | "kodate" | "grantact", string] | null {
  const p = new URL(url, BASE_URL).pathname;
  const m =
    p.match(/^\/(mansion|kodate)\/([A-Z0-9]+)\/?$/) ??
    p.match(/^\/(grantact)\/detail\/([A-Z0-9]+)\/?$/);
  return m?.[1] && m[2] ? [m[1] as "mansion" | "kodate" | "grantact", m[2]] : null;
}

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "東急リバブル（売買）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "40 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "2",
  },

  queries: () =>
    TYPES.flatMap((type) =>
      AREAS.map((a) => ({ key: `${type}-${a.key}`, params: { type, path: a.path } })),
    ),

  buildListUrl: (q) => `${BASE_URL}/kounyu/${q.params.type}/tokyo/${q.params.path}/?sort=address`,

  async fetchList(ctx, url) {
    const props = nextDataProps(await getOk(ctx, url));
    return JSON.stringify(pick(props, ["searchedResultCounts", "propertyList"]));
  },

  parseList(json, url) {
    const data = JSON.parse(json) as {
      searchedResultCounts?: string | number;
      propertyList?: SaleListProperty[];
    };
    if (!Array.isArray(data.propertyList)) throw new Error(`一覧に propertyList が無い: ${url}`);
    const items: ListItem[] = data.propertyList.flatMap((p) => {
      if (!p.detailUrl) throw new Error(`一覧の物件に詳細URLが無い: ${url}`);
      // 新築の分譲は物件ごとの外部サイト（https://l-shirokanetakanawa.jp/ など）へのリンク。部屋の情報が無いので読まない
      if (new URL(p.detailUrl, BASE_URL).origin !== BASE_URL) return [];
      const key = detailKey(p.detailUrl);
      if (!key) throw new Error(`一覧の物件の詳細URLが解釈できない: ${p.detailUrl}`);
      return {
        sourceListingId: key[1],
        detailUrl: new URL(p.detailUrl, BASE_URL).toString(),
        listHash: sha1(JSON.stringify([p.priceModel?.price, p.propertyDetail])),
        price: p.priceModel?.price,
      };
    });
    const total = Number(String(data.searchedResultCounts ?? "").trim());
    const u = new URL(url);
    const page = Number(u.searchParams.get("page") ?? "1");
    let next: string | null = null;
    if (items.length > 0 && Number.isFinite(total) && page * PAGE_SIZE < total) {
      u.searchParams.set("page", String(page + 1));
      next = u.toString();
    }
    // 表示の件数には新築分譲（外部サイト）も含まれるので、件数照合はしない
    return { items, nextPageUrl: next, totalCount: null };
  },

  async fetchDetail(ctx, item) {
    const html = await getOk(ctx, item.detailUrl);
    // GRANTACT は SSR の HTML をそのまま、通常の詳細は pageProps の必要な部分を JSON にする
    if (detailKey(item.detailUrl)?.[0] === "grantact") return html;
    const props = nextDataProps(html);
    return JSON.stringify(
      pick(props, ["isExpired", "detailCard", "summary", "specificSection", "detailImages"]),
    );
  },

  parseDetail(body, url) {
    const key = detailKey(url);
    if (!key) throw new Error(`物件番号が URL から取れない: ${url}`);
    const [type, id] = key;
    const fields: Record<string, string> = {};

    if (type === "grantact") {
      const $ = cheerio.load(body);
      $("th").each((_, th) => {
        const k = squash($(th).text()).replace(/\s/g, "");
        const td = $(th).next("td").clone();
        if (!k || td.length === 0 || fields[k] != null) return;
        td.find("br").replaceWith("\n");
        fields[k] = td
          .text()
          .split("\n")
          .map((l) => squash(l))
          .filter(Boolean)
          .join("\n");
      });
      if (!fields.価格) throw new Error(`GRANTACT の物件概要が見つからない: ${url}`);
      fields.物件名 = fields.マンション名 ?? "";
      fields.物件種別 = "マンション";
      // 写真は背景画像（/grantact/img/upload/residences_main/… ・ residence_images/…）。スマホ用（_sp）は除く
      const urls = new Set<string>();
      for (const m of body.matchAll(/url\(\s*['"]?(\/grantact\/img\/upload\/[^)'"\s]+)/g)) {
        if (m[1] && !/_sp\//.test(m[1])) urls.add(new URL(m[1], BASE_URL).toString());
      }
      return { sourceListingId: id, url, fields, imageUrls: [...urls] };
    }

    const d = JSON.parse(body) as LivableDetail;
    if (d.isExpired) throw new Error(`掲載終了: ${url}`);
    for (const item of d.summary?.tableItems ?? []) {
      const k = item.title.replace(/\s+/g, "");
      if (item.type === "linkList") {
        const links = (item.data as { links?: { text?: string }[] }).links ?? [];
        fields[k] = links.map((l) => l.text ?? "").join("");
      } else if (item.type === "multiLinkList") {
        fields[k] = accessLines(item.data).join("\n");
      } else if (item.type === "price") {
        const price = (item.data as { price?: { price?: number } }).price?.price;
        if (price != null) fields.価格 = String(price);
      } else if (typeof item.data === "string") {
        fields[k] = item.type === "html" ? htmlText(item.data) : squash(item.data);
      }
    }
    if (!fields.価格) throw new Error(`物件概要に価格が無い: ${url}`);
    fields.物件名 = d.detailCard?.propertyName ?? "";
    fields.物件種別 = type === "kodate" ? "一戸建て" : "マンション";
    const images = [
      ...(d.detailImages?.modal?.allImages ?? []).map((i) => originalImage(i.src)),
      originalImage(d.detailImages?.modal?.subImage?.src),
    ].filter((u): u is string => !!u && /^https:\/\//.test(u));
    return { sourceListingId: id, url, fields, imageUrls: [...new Set(images)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    // 通常の詳細は円の数値、GRANTACT は "7億4,500万円"
    const price = /^\d+$/.test(f.価格 ?? "") ? Number(f.価格) : parseYen(f.価格);
    if (price == null || price <= 0) throw new Error(`価格が解釈できない: ${f.価格}`);
    const house = f.物件種別 === "一戸建て";

    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");
    const stations = (f.交通 ?? f["交通/駅徒歩"] ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    // 通常 "4階 / 地上14階" ・ GRANTACT 所在階 "13階" と 建物階数 "地下2階付 地上14階建" ・ 一戸建て 建物構造 "鉄骨造 3階"
    const floorText = f.所在階数 ?? f.所在階 ?? "";
    const totalText = f.建物階数 ?? f.所在階数 ?? f.建物構造 ?? "";
    const direction = f.向き?.replace(/向き$/, "").replace(/^[-－ー]+$/, "") || null;
    const mode = f.取引態様 ?? "";
    const yenPerMonth = (s: string | undefined) =>
      parseYen(s?.split("\n")[0]?.replace(/（円\/月）|\(円\/月\)/, "円"));

    const extraKeys = [
      "バルコニー面積",
      "土地面積",
      "総戸数",
      "土地権利",
      "分譲会社",
      "施工会社",
      "管理会社",
      "管理形態",
      "管理員の勤務形態",
      "その他費用",
      "その他費用(月額)",
      "駐車場",
      "駐車場(月額)",
      "現況",
      "引渡可能年月",
      "引渡可能時期",
      "接道状況",
      "接道方向／幅員",
      "用途地域等",
      "建ぺい率",
      "容積率",
      "備考",
    ];
    const extra: Record<string, string> = Object.fromEntries(
      extraKeys.filter((k) => f[k] && !/^-+$/.test(f[k] as string)).map((k) => [k, f[k] as string]),
    );
    // 取り込み時の共通処理（引渡時期・駐車場）が読む名前にも入れる
    const handover = f.引渡可能年月 ?? f.引渡可能時期;
    if (handover) extra.引渡時期 = handover;
    const parking = f.駐車場 ?? f["駐車場(月額)"];
    if (parking && !/^-+$/.test(parking)) extra.駐車場 = parking;

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "sale",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: house ? null : yenPerMonth(f.管理費 ?? f["管理費(月額)"]),
      deposit: null,
      keyMoney: null,
      layout: parseLayout(f.間取り ?? f.間取),
      areaSqm: parseAreaSqm((house ? f.建物面積 : f.専有面積)?.replace(/^(壁芯|内法|公簿)/, "")),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor: house ? null : parseFloor(floorText.split("/")[0]).floor,
      // 一戸建ては "鉄骨造 3階"（「地上」「建」が無い）
      totalFloors:
        parseTotalFloors(totalText) ??
        (house ? Number(totalText.match(/(\d+)階/)?.[1] ?? Number.NaN) || null : null),
      structure: parseStructure(f.建物構造),
      direction,
      features: [
        ...new Set([
          ...extractFeatures([f["設備・条件"], f.備考].join("、")),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES.find(([re]) => re.test(mode))?.[1] ?? "unknown",
      adAllowed: null,
      agencyName: "東急リバブル",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: null,
      repairReserveFee: house ? null : yenPerMonth(f.修繕積立金 ?? f["修繕積立金(月額)"]),
      propertyType: house ? "house" : "mansion",
      extra,
    };
  },
});
