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
  type StationAccess,
  splitAddress,
  type TransactionMode,
} from "@devote/core";
import * as cheerio from "cheerio";
import { defineAdapter, type FetchContext, type ListItem } from "../../adapter.js";
import { describeBody, detectBlockPage } from "../../block.js";
import { parseStructure } from "../../helpers.js";

/**
 * 東急リバブル（https://www.livable.co.jp/chintai/）の賃貸。
 *
 * - Next.js（pages router）。一覧・詳細とも HTML に埋め込まれた __NEXT_DATA__ の pageProps に全データがある
 *   → fetchList / fetchDetail で pageProps の必要な部分だけを JSON にして返し、パーサは JSON を読む
 *   （HTML は 0.6〜1.5MB あるため、スナップショットとフィクスチャを小さくする）
 * - 一覧 /chintai/tokyo/{エリア}/?sort=address&page=N。エリアは区（a13103）か町（t13102003 = 勝どき、t13102034 = 晴海）。30件/ページ
 *   並びは「所在地順」に固定する（既定の「おすすめ順」はページ送り中に順位が変わりうる）
 * - 詳細 /chintai/{物件番号}/（例 L826101903）。掲載終了は pageProps.isExpired
 */
const BASE_URL = "https://www.livable.co.jp";
const SOURCE_ID = "livable";
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

const TRANSACTION_MODES: Record<string, TransactionMode> = {
  貸主: "owner",
  代理: "agent",
  専属専任媒介: "exclusive_agency",
  専任媒介: "exclusive_agency",
  一般媒介: "general_agency",
  仲介: "brokerage",
  媒介: "brokerage",
};

/** pageProps のうち一覧で使う部分 */
export interface LivableList {
  searchedResultCounts?: string | number;
  propertyList?: LivableListProperty[];
}
interface LivableListProperty {
  propertyCd: string;
  propertyName?: string;
  detailUrl: string;
  address?: string;
  priceModel?: LivablePrice;
  propertyDetail?: string[];
}
interface LivablePrice {
  rent?: number;
  manageCost?: number;
}

/** pageProps のうち詳細で使う部分 */
export interface LivableDetail {
  isExpired?: boolean;
  detailCard?: { propertyCd?: string; propertyName?: string };
  summary?: { tableItems?: { type: string; title: string; data: unknown }[] };
  specificSection?: { propertyFeatureImage?: { text?: string }[] };
  detailImages?: { modal?: { allImages?: { src?: string }[]; subImage?: { src?: string } } };
  recommendedPoint?: { text?: string };
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
export const squash = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** HTML 断片 → 改行区切りのテキスト（"<ul><li>■オートロック</li>…" / "1ヶ月 / 1ヶ月<br>- / -"） */
export function htmlText(html: string): string {
  const $ = cheerio.load(
    `<div>${html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/li>/gi, "\n")}</div>`,
  );
  return $("div")
    .text()
    .split("\n")
    .map((l) => squash(l))
    .filter(Boolean)
    .join("\n");
}

/** HTML から __NEXT_DATA__ の pageProps を取り出す */
export function nextDataProps(html: string): Record<string, unknown> {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error(`__NEXT_DATA__ が見つからない: ${describeBody(html)}`);
  const props = (JSON.parse(m[1]) as { props?: { pageProps?: Record<string, unknown> } }).props
    ?.pageProps;
  if (!props) throw new Error("__NEXT_DATA__ に pageProps が無い");
  return props;
}

export const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

export async function getOk(ctx: FetchContext, url: string): Promise<string> {
  const res = await ctx.get(url);
  const blocked = detectBlockPage(res.body, res.status);
  if (blocked)
    throw new Error(`ブロック・チャレンジの可能性（${blocked}）: ${url} ${describeBody(res.body)}`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.body;
}

/** "徒歩4分" などを連結した交通の行 */
export function accessLines(data: unknown): string[] {
  const links = (data as { links?: { text?: string }[][] } | undefined)?.links ?? [];
  return links.map((row) => row.map((l) => l.text ?? "").join(" "));
}

/** 画像プロキシ（img.livable.co.jp/?url=…&w=…）から元画像のURLを取り出す */
export function originalImage(src: string | undefined): string | null {
  if (!src) return null;
  try {
    const u = new URL(src, BASE_URL);
    return u.searchParams.get("url") ?? u.toString();
  } catch {
    return null;
  }
}

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "東急リバブル（賃貸）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "35 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "2",
  },

  queries: () => AREAS.map((a) => ({ key: a.key, params: { path: a.path } })),

  buildListUrl: (q) => `${BASE_URL}/chintai/tokyo/${q.params.path}/?sort=address`,

  async fetchList(ctx, url) {
    const props = nextDataProps(await getOk(ctx, url));
    return JSON.stringify(pick(props, ["searchedResultCounts", "propertyList"]));
  },

  parseList(json, url) {
    const data = JSON.parse(json) as LivableList;
    if (!Array.isArray(data.propertyList)) throw new Error(`一覧に propertyList が無い: ${url}`);
    const items: ListItem[] = data.propertyList.flatMap((p) => {
      if (!p.propertyCd || !p.detailUrl) throw new Error(`一覧の物件に番号/リンクが無い: ${url}`);
      // 一棟貸しの建物ページ（/chintai/t-detail/…）は部屋ではない（賃料が無く、複数の部屋をまとめた案内）ので読まない
      if (/\/t-detail\//.test(p.detailUrl)) return [];
      return {
        sourceListingId: p.propertyCd,
        detailUrl: new URL(p.detailUrl, BASE_URL).toString(),
        listHash: sha1(
          JSON.stringify([p.priceModel?.rent, p.priceModel?.manageCost, p.propertyDetail]),
        ),
        price: p.priceModel?.rent,
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
    // 表示の件数には一棟貸しの建物ページも含まれるので、件数照合はしない
    return { items, nextPageUrl: next, totalCount: null };
  },

  async fetchDetail(ctx, item) {
    const props = nextDataProps(await getOk(ctx, item.detailUrl));
    return JSON.stringify(
      pick(props, [
        "isExpired",
        "detailCard",
        "summary",
        "specificSection",
        "detailImages",
        "recommendedPoint",
      ]),
    );
  },

  parseDetail(json, url) {
    const d = JSON.parse(json) as LivableDetail;
    const id = new URL(url).pathname.match(/\/chintai\/([A-Z0-9]+)\/?$/)?.[1];
    if (!id) throw new Error(`物件番号が URL から取れない: ${url}`);
    if (d.isExpired) throw new Error(`掲載終了: ${url}`);

    const fields: Record<string, string> = {};
    for (const item of d.summary?.tableItems ?? []) {
      const key = item.title.replace(/\s+/g, "");
      if (item.type === "linkList") {
        const links = (item.data as { links?: { text?: string }[] }).links ?? [];
        fields[key] = links.map((l) => l.text ?? "").join("");
      } else if (item.type === "multiLinkList") {
        fields[key] = accessLines(item.data).join("\n");
      } else if (item.type === "price") {
        const price = (item.data as { price?: LivablePrice }).price;
        if (price?.rent != null) fields.賃料 = String(price.rent);
        if (price?.manageCost != null) fields.管理費 = String(price.manageCost);
      } else if (typeof item.data === "string") {
        fields[key] = item.type === "html" ? htmlText(item.data) : squash(item.data);
      }
    }
    if (!fields.賃料) throw new Error(`物件概要に賃料が無い: ${url}`);
    fields.物件名 = d.detailCard?.propertyName ?? "";
    fields.特徴アイコン = (d.specificSection?.propertyFeatureImage ?? [])
      .map((x) => htmlText(x.text ?? "").replace(/\n/g, ""))
      .join("、");
    fields.おすすめポイント = htmlText(d.recommendedPoint?.text ?? "");

    const images = [
      ...(d.detailImages?.modal?.allImages ?? []).map((i) => originalImage(i.src)),
      originalImage(d.detailImages?.modal?.subImage?.src),
    ].filter((u): u is string => !!u && /^https:\/\//.test(u));

    return { sourceListingId: id, url, fields, imageUrls: [...new Set(images)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const price = Number(f.賃料);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`賃料が解釈できない: ${f.賃料}`);

    // "1ヶ月 / 1ヶ月\n- / -"（敷金/礼金 と 敷金償却/敷引）
    const [depositText, keyMoneyText] = (f["敷金/礼金敷金償却/敷引"] ?? "")
      .split("\n")[0]
      ?.split(/\s*[/／]\s*/) ?? [undefined, undefined];
    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    // "38階建ての19階部分" / "11階建ての3階部分"
    const { floor, totalFloors } = parseFloor(f.所在階数);
    const direction = f.向き?.replace(/向き$/, "").replace(/^[-－ー]+$/, "") || null;
    const type = f.物件種別 ?? "";
    const house = /一戸建|戸建|テラス/.test(type);

    const extraKeys = [
      "物件種別",
      "入居可能時期",
      "契約の種類・期間",
      "更新料",
      "駐車場",
      "損保",
      "その他費用",
      "入居条件",
      "仲介手数料",
      "備考",
      "おすすめポイント",
    ];
    const extra: Record<string, string> = Object.fromEntries(
      extraKeys.filter((k) => f[k] && f[k] !== "-").map((k) => [k, f[k] as string]),
    );
    // 契約の種類と期間は1項目（"定期建物賃貸借契約  期間：4年"）。取り込み時の共通処理が読む名前にも入れる
    if (f["契約の種類・期間"]) extra.契約形態 = f["契約の種類・期間"];

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      // 管理費が無い物件は表示も無い（0円か込みかは分からない）ので null
      managementFee: f.管理費 != null ? Number(f.管理費) : null,
      deposit: parseMonthsOrYen(depositText, price),
      keyMoney: parseMonthsOrYen(keyMoneyText, price),
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm(f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor: house ? null : floor,
      totalFloors,
      structure: parseStructure(f.構造),
      direction,
      features: [
        ...new Set([
          ...extractFeatures([f.設備, f.特徴アイコン, f.おすすめポイント, f.備考].join("、")),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "東急リバブル",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: null,
      repairReserveFee: null,
      propertyType: house ? "house" : "mansion",
      extra,
    };
  },
});
