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
  parseStructure,
  parseYen,
  type StationAccess,
  type TransactionMode,
} from "@devote/core";
import * as cheerio from "cheerio";
import { defineAdapter, type ListItem } from "../../adapter.js";

/**
 * 架空の不動産会社サイト（SSR・静的HTML・一覧+詳細の典型構成）向けのリファレンス実装。
 * 新しいアダプターはこのファイルをコピーして作る（.claude/skills/scraper-adapter 参照）。
 */
const BASE_URL = "https://sample-realtor.example";

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

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export default defineAdapter({
  meta: {
    id: "sample-realtor",
    displayName: "サンプル不動産（リファレンス実装）",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2000, maxConcurrency: 1 },
    schedule: { listCron: "0 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "1",
  },

  queries: () => [{ key: "meguro-rent", params: { area: "meguro" } }],

  buildListUrl: (q) => `${BASE_URL}/rent/list?area=${q.params.area}`,

  parseList(html, url) {
    const $ = cheerio.load(html);
    const items: ListItem[] = $("li.property")
      .toArray()
      .map((el) => {
        const $el = $(el);
        const href = $el.find("a.property-link").attr("href");
        const id = $el.attr("data-id");
        if (!href || !id) throw new Error(`一覧の行から ID/リンクが取れない: ${$el.html()}`);
        const rent = $el.find(".rent").text().trim();
        return {
          sourceListingId: id,
          detailUrl: new URL(href, url).toString(),
          listHash: sha1([rent, $el.find(".layout").text(), $el.find(".area").text()].join("|")),
          price: parseYen(rent) ?? undefined,
        };
      });
    const next = $("nav.pager a.next").attr("href");
    const total = $(".result-count strong").text().trim();
    return {
      items,
      nextPageUrl: next ? new URL(next, url).toString() : null,
      totalCount: total ? Number(total) : null,
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const fields: Record<string, string> = { 建物名: $("h1.building-name").text().trim() };
    $("table.spec tr").each((_, tr) => {
      const key = $(tr).find("th").text().trim();
      // <br> 区切りの複数行（交通など）は改行に変換して保持
      const td = $(tr).find("td");
      td.find("br").replaceWith("\n");
      fields[key] = td.text().trim();
    });
    const id = fields.物件番号;
    if (!id) throw new Error(`物件番号が取れない: ${url}`);
    return {
      sourceListingId: id,
      url,
      fields,
      imageUrls: $(".gallery img")
        .toArray()
        .map((img) => new URL($(img).attr("src") ?? "", url).toString()),
    };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const price = parseYen(f.賃料);
    if (price == null || price <= 0) throw new Error(`賃料が解釈できない: ${f.賃料}`);

    const [depositText, keyMoneyText] = (f["敷金／礼金"] ?? "").split(/[／/]/);
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const addr = (f.所在地 ?? "").normalize("NFKC");
    const addrMatch = addr.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])?(.*)$/);
    const { floor, totalFloors } = parseFloor(f["階建／階"]);
    const direction = f.向き?.trim() || null;
    const updated = f.情報更新日?.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);

    return {
      source: "sample-realtor",
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.建物名 || null,
      address: {
        prefecture: addrMatch?.[1] ?? null,
        city: addrMatch?.[2] ?? null,
        town: addrMatch?.[3]?.replace(/\d+丁目$/, "") || null,
        raw: f.所在地 ?? "",
      },
      stations,
      price,
      managementFee: parseYen(f["管理費・共益費"]),
      deposit: parseMonthsOrYen(depositText, price),
      keyMoney: parseMonthsOrYen(keyMoneyText, price),
      layout: parseLayout(f.間取り),
      areaSqm: parseAreaSqm(f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor,
      totalFloors,
      structure: parseStructure(f.構造),
      direction,
      features: [...extractFeatures(f["設備・条件"] ?? ""), ...directionFeatures(direction)],
      transactionMode: TRANSACTION_MODES[f.取引態様?.trim() ?? ""] ?? "unknown",
      adAllowed: null,
      agencyName: "サンプル不動産",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: updated
        ? new Date(
            `${updated[1]}-${updated[2]?.padStart(2, "0")}-${updated[3]?.padStart(2, "0")}T00:00:00+09:00`,
          ).toISOString()
        : null,
    };
  },
});
