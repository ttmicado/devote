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
import { describeBody, detectBlockPage } from "../../block.js";
import { parseJpDate, parseStructure, parseTotalFloors } from "../../helpers.js";
import { addressInTowns, carryTowns, townsOf, withTowns } from "../../town-filter.js";

/**
 * 三井の賃貸（三井不動産レジデンシャルリース、https://www.mitsui-chintai.co.jp/）。
 *
 * - 一覧・詳細ともに SSR（Laravel）→ HTTP
 * - 一覧 /rf/result?ku=(1,22)&get=ward（区）/ /rf/result?are=10&get=area（エリア「月島・勝どき・豊洲」）。
 *   建物単位で 15棟/ページ、各建物の下に空室が全件並ぶ（「すべてのお部屋を表示」は表示の開閉だけ）。次ページは page=N
 *   区・エリアのコードは /rf/api/url/ward/{Minato-ku} が返す URL で確認できる
 * - 詳細は部屋単位 /rf/tatemono/{建物}/{部屋}。sourceListingId は "建物-部屋"（例 6412-203）
 * - 詳細の写真は JS が /rf/photo/{建物}/{部屋}（JSON）から読み込む → fetchDetail で取得し、
 *   HTML の末尾に <script id="devote-photos"> として付けて parseDetail に渡す
 */
const BASE_URL = "https://www.mitsui-chintai.co.jp";
const SOURCE_ID = "mitsui-chintai";

const AREA_QUERIES: { key: string; params: Record<string, string> }[] = [
  { key: "minato", params: { ku: "(1,22)", get: "ward" } },
  { key: "shibuya", params: { ku: "(1,10)", get: "ward" } },
  { key: "chiyoda", params: { ku: "(1,17)", get: "ward" } },
  { key: "shinagawa", params: { ku: "(1,9)", get: "ward" } },
  // 「月島・勝どき・豊洲」エリア（晴海を含む）。月島・佃などは一覧で落とす
  { key: "kachidoki-harumi-toyosu", params: { are: "10", get: "area", towns: "勝どき,晴海,豊洲" } },
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

interface Photo {
  ROOM_NO?: number | string;
  filename?: string;
}

/** 詳細URL /rf/tatemono/6412/203 → "6412-203" */
function roomId(url: string): string | null {
  const m = new URL(url).pathname.match(/\/rf\/tatemono\/(\d+)\/([^/]+)\/?$/);
  return m ? `${m[1]}-${decodeURIComponent(m[2] ?? "")}` : null;
}

/**
 * 交通の dd: <a>事業者 路線</a> <a>駅</a> 徒歩2分<br> の繰り返し → "都営浅草線「泉岳寺」駅 徒歩2分"
 * 事業者名（"東京都交通局" "ＪＲ" 等）は路線名の前に改行で付いているので落とす
 */
function stationLines($: cheerio.CheerioAPI, dd: ReturnType<cheerio.CheerioAPI>): string[] {
  const lines: string[] = [];
  let parts: string[] = [];
  const flush = () => {
    const [line, station, ...rest] = parts;
    if (line && station) lines.push(`${line}「${station}」駅 ${rest.join(" ")}`.trim());
    parts = [];
  };
  const root = dd.find(".__data").length ? dd.find(".__data") : dd;
  root.contents().each((_, node) => {
    if (node.type === "tag" && node.name === "br") return flush();
    if (node.type === "tag" && node.name === "a") {
      const text = $(node).text().split("\n").map(squash).filter(Boolean);
      parts.push(text.at(-1) ?? "");
      return;
    }
    if (node.type === "text") {
      const t = squash(node.data);
      if (t) parts.push(t);
    }
  });
  flush();
  return lines;
}

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "三井の賃貸（三井不動産レジデンシャルリース）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2500, maxConcurrency: 1 },
    schedule: { listCron: "45 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: () => AREA_QUERIES,

  buildListUrl: (q) => {
    const { towns, ...params } = q.params as Record<string, string>;
    // ku=(1,22) の括弧・カンマはサイトのリンクどおりエンコードしない
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return withTowns(`${BASE_URL}/rf/result?${qs}`, towns?.split(","));
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const towns = townsOf(url);
    const items: ListItem[] = [];

    $(".c-result-build").each((_, build) => {
      const $b = $(build);
      const address = squash(
        $b
          .find(".c-result-build__overview-list dt")
          .filter((__, dt) => squash($(dt).text()) === "住所")
          .next("dd")
          .text(),
      );
      if (towns && !addressInTowns(address, towns)) return;
      $b.find("tr[data-js-room-link]").each((__, tr) => {
        const $tr = $(tr);
        const href = $tr.attr("data-js-room-link") ?? "";
        const id = href ? roomId(new URL(href, url).toString()) : null;
        if (!id) throw new Error(`一覧の部屋行からリンクが取れない: ${squash($tr.text())}`);
        const rent = squash($tr.find(".c-room-list__rent").text());
        items.push({
          sourceListingId: id,
          detailUrl: new URL(href, url).toString(),
          listHash: sha1(
            [
              rent,
              squash($tr.find(".c-room-list__fee").text()),
              squash($tr.find(".__body-shikirei").text()),
              squash($tr.find(".__body-size").text()),
              squash($tr.find(".__body-flag").text()),
            ].join("|"),
          ),
          price: parseYen(rent) ?? undefined,
        });
      });
    });

    const next = $("a.c-pagination__link.--next").first().attr("href");
    const rooms = $(".c-result-summary__number-list")
      .filter((_, dl) => squash($(dl).find("dt").text()) === "対象お部屋数")
      .find(".c-result-summary__fig")
      .text()
      .replace(/,/g, "");
    return {
      items,
      nextPageUrl: carryTowns(next ? new URL(next, url).toString() : null, url),
      totalCount: towns ? null : /^\d+$/.test(rooms) ? Number(rooms) : null,
    };
  },

  async fetchDetail(ctx, item) {
    const res = await ctx.get(item.detailUrl);
    const blocked = detectBlockPage(res.body, res.status);
    if (blocked)
      throw new Error(
        `ブロック・チャレンジの可能性（${blocked}）: ${item.detailUrl} ${describeBody(res.body)}`,
      );
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${item.detailUrl}`);
    const path = new URL(item.detailUrl).pathname.replace(/^\/rf\/tatemono\//, "/rf/photo/");
    const photos = await ctx.get(`${BASE_URL}${path}`);
    const json = photos.status === 200 && /^\s*\[/.test(photos.body) ? photos.body : "[]";
    return `${res.body}\n<script type="application/json" id="devote-photos">${json}</script>\n`;
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const id = roomId(url);
    if (!id) throw new Error(`建物・部屋番号が URL から取れない: ${url}`);

    const fields: Record<string, string> = {};
    $(".c-buildroom__summary-overview-list dt, .c-buildroom-detail__list dt").each((_, dt) => {
      const key = squash($(dt).text()).replace(/\s/g, "");
      const dd = $(dt).nextAll("dd").not(".__map").first();
      if (!key || dd.length === 0) return;
      if (key === "交通") {
        // 概要（最寄り1駅）と詳細（全駅）の両方にある。駅の多い方を使う
        const lines = stationLines($, dd);
        if (lines.length > (fields.交通?.split("\n").length ?? 0)) fields.交通 = lines.join("\n");
        return;
      }
      if (key === "アピールポイント") {
        fields[key] = dd
          .find(".c-flag")
          .map((__, s) => squash($(s).text()))
          .get()
          .join("、");
        return;
      }
      const clone = dd.clone();
      clone.find("br").replaceWith("\n");
      fields[key] = clone
        .text()
        .split("\n")
        .map((line) => squash(line.replace(/ /g, " ")))
        .filter(Boolean)
        .join("\n");
    });
    if (!fields["賃料・管理費・共益費"]) throw new Error(`物件概要が見つからない: ${url}`);

    // 見出し "協和高輪マンション\n2階２０３"
    const heading = $("h1.c-buildroom__summary-h").text().split("\n").map(squash).filter(Boolean);
    fields.物件名 = heading[0] ?? "";
    fields.階部屋 = heading[1] ?? "";
    fields.フラグ = $(".c-buildroom__summary-flag .c-flag")
      .map((_, s) => squash($(s).text()))
      .get()
      .join("、");

    let photos: Photo[] = [];
    try {
      photos = JSON.parse($("#devote-photos").text() || "[]") as Photo[];
    } catch {
      photos = [];
    }
    const room = id.split("-")[1];
    const imageUrls = photos
      .filter((p) => String(p.ROOM_NO) === "99999" || String(p.ROOM_NO) === room)
      .map((p) => p.filename)
      .filter((u): u is string => !!u && /^https:\/\//.test(u));
    // 写真の JSON が取れなかったときは、ページにある間取り図だけでも残す
    if (imageUrls.length === 0) {
      $(".c-buildroom-slide__main img[src]").each((_, img) => {
        const src = $(img).attr("src");
        if (src && !/missing|nofloorplan/.test(src)) imageUrls.push(new URL(src, url).toString());
      });
    }

    return { sourceListingId: id, url, fields, imageUrls: [...new Set(imageUrls)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    // "112,000円 / 0円"
    const [rentText, feeText] = (f["賃料・管理費・共益費"] ?? "").split(/\s*[/／]\s*/);
    const price = parseYen(rentText);
    if (price == null || price <= 0) throw new Error(`賃料が解釈できない: ${rentText}`);
    const [depositText, keyMoneyText] = (f["敷金／礼金"] ?? "").split(/\s*[/／]\s*/);
    const [layoutText, areaText] = (f["間取り・面積"] ?? "").split(/\s*[/／]\s*/);

    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const direction = f.方位?.replace(/向き$/, "").replace(/^[-－ー]+$/, "") || null;

    const extraKeys = [
      "階部屋",
      "入居可能日",
      "案内可能日",
      "契約期間",
      "更新料",
      "駐車場",
      "その他費用",
      "保証会社情報",
      "備考",
      "共用部管理会社",
      "保険",
      "フラグ",
    ];
    const extra: Record<string, string> = Object.fromEntries(
      extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string]),
    );
    // "24ヶ月\n（定期借家）" は契約形態と期間の両方を含む。取り込み時の共通処理が読む名前にも入れる
    if (f.契約期間) extra.契約形態 = f.契約期間;

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.物件名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: parseYen(feeText),
      deposit: parseMonthsOrYen(depositText, price),
      keyMoney: parseMonthsOrYen(keyMoneyText, price),
      layout: parseLayout(layoutText),
      areaSqm: parseAreaSqm(areaText),
      builtYearMonth: parseBuiltYearMonth(f.竣工日),
      floor: parseFloor(f.階部屋?.match(/^(地下)?\d+階/)?.[0]).floor,
      totalFloors: parseTotalFloors(f.規模構造),
      structure: parseStructure(f.規模構造),
      direction,
      features: [
        ...new Set([
          ...extractFeatures(
            [f["専有部・共用部設備"], f.アピールポイント, f.フラグ, f.備考].join("、"),
          ),
          ...directionFeatures(direction),
        ]),
      ],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "三井不動産レジデンシャルリース",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(f.情報更新日),
      repairReserveFee: null,
      propertyType: "mansion",
      extra,
    };
  },
});
