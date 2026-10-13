import { createHash } from "node:crypto";
import {
  extractFeatures,
  type NormalizedListingInput,
  parseAreaSqmOrTsubo,
  parseBuiltYearMonth,
  parseFloor,
  parseJpDate,
  parseLayout,
  parseMonthsOrYen,
  parseStationAccess,
  parseStructure,
  parseTotalFloors,
  parseYen,
  type StationAccess,
  splitAddress,
  type TransactionMode,
} from "@devote/core";
import * as cheerio from "cheerio";
import { defineAdapter, type ListItem, type SearchQuery } from "../../adapter.js";

/**
 * アクセルホーム（https://www.axel-home.com/）— 都心の賃貸仲介（千代田・月島・代々木店）。
 * 売買ページ（/buy/, /sale/）は相談窓口のみで物件検索がないため、賃貸（住居・事業用）のみ対象。
 *
 * - 一覧・詳細ともに SSR（Laravel + Vite）→ fetchMode は http
 * - 一覧: 区ページ /areas/{minato|shibuya|chiyoda|shinagawa}?usage={residence|business}、
 *         町名で絞る場合は /areas/result?usage=...&city_ids[0]={町ID}（勝どき=175, 豊洲=2）
 *   1ページ12棟。各建物の下に空室カード（.js-lines-result-card）が全件並ぶ
 * - 「計N件」は建物数（空室0の建物を含む）なので totalCount には使わない
 * - 空室のある建物が先、空室0の建物が後ろに並ぶ。空室0の建物が出たページで巡回を打ち切る
 *   （港区は全151ページのうち空室ありは十数ページ）
 * - 詳細は部屋単位 /property/{物件番号}/outline/{部屋ID}。sourceListingId は部屋ID（"r44026"）
 *
 * 事業用（事務所・店舗）:
 * - 用途はURLの usage で切り替わる（residence=住居、business=事務所・店舗）。詳細ページの本文は
 *   どちらでも同じで、用途を示すのは一覧から引き継いだ詳細URLの ?usage= だけ。normalize はこれで判定する
 * - 事業用の一覧には「SOHO・事務所可」の住居も並ぶ（住居の一覧と同じ部屋IDで重複する）。
 *   事業用の一覧では、建物タグに「SOHO」がある建物と、間取りが K/DK/LDK の部屋（住戸）を除外する（isResidentialLike）
 * - 事業用のクエリを先、住居のクエリを後に並べる。ランナーは同じ部屋IDを後のクエリの詳細URLで上書きするため、
 *   除外をすり抜けた重複があっても住居の一覧にある部屋は住居として取り込まれる
 * - 事業用の詳細は「敷金/礼金」の代わりに「保証金/礼金」のことがある。間取り欄は「1R」「ワンフロア」
 */
const BASE_URL = "https://www.axel-home.com";
const SOURCE_ID = "axel-home";

const AREAS: { key: string; params: Record<string, string> }[] = [
  { key: "minato", params: { path: "/areas/minato" } },
  { key: "shibuya", params: { path: "/areas/shibuya" } },
  { key: "chiyoda", params: { path: "/areas/chiyoda" } },
  { key: "shinagawa", params: { path: "/areas/shinagawa" } },
  { key: "chuo-kachidoki", params: { path: "/areas/result", city_id: "175" } },
  { key: "koto-toyosu", params: { path: "/areas/result", city_id: "2" } },
];

/** サイトの usage パラメータ。事業用を先に巡回する（上のコメント参照） */
const USAGES = [
  { usage: "business", keyPrefix: "business-" },
  { usage: "residence", keyPrefix: "" },
] as const;

const AREA_QUERIES: SearchQuery[] = USAGES.flatMap(({ usage, keyPrefix }) =>
  AREAS.map((a) => ({ key: `${keyPrefix}${a.key}`, params: { ...a.params, usage } })),
);

/** 一覧・詳細のURLが事業用（?usage=business）か */
const isBusinessUrl = (url: string) => new URL(url).searchParams.get("usage") === "business";

/**
 * 事業用の一覧・詳細に混ざる住居かどうか。
 * - 建物タグに「SOHO」（SOHO・事務所利用可のマンション。住居の一覧にも同じ部屋が出る）
 * - 間取りが K/DK/LDK（住戸の間取り。事務所・店舗は「1R」「ワンフロア」表記）
 */
export function isResidentialLike(tags: string[], layoutText: string | undefined): boolean {
  if (tags.some((t) => /SOHO/i.test(t))) return true;
  return /K$/.test(parseLayout(layoutText) ?? "");
}

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

export default defineAdapter({
  meta: {
    id: SOURCE_ID,
    displayName: "アクセルホーム",
    kind: "realtor_own",
    fetchMode: { list: "http", detail: "http" },
    requiresLogin: false,
    rateLimit: { minIntervalMs: 2000, maxConcurrency: 1 },
    schedule: { listCron: "45 */3 * * *", detailRevisitHours: 48 },
    parserVersion: "2",
  },

  queries: () => AREA_QUERIES,

  buildListUrl: (q) => {
    const u = new URL(String(q.params.path), BASE_URL);
    u.searchParams.set("usage", String(q.params.usage ?? "residence"));
    if (q.params.city_id) u.searchParams.set("city_ids[0]", String(q.params.city_id));
    return u.toString();
  },

  parseList(html, url) {
    const $ = cheerio.load(html);
    const items: ListItem[] = [];
    let sawEmptyBuilding = false;
    const business = isBusinessUrl(url);

    $("section.js-lines-result-result-item").each((_, sec) => {
      const cards = $(sec).find(".js-lines-result-card");
      if (cards.length === 0) sawEmptyBuilding = true;
      const tags = $(sec)
        .find(".c-result-section__tag")
        .toArray()
        .map((el) => squash($(el).text()));
      cards.each((__, card) => {
        const $card = $(card);
        // 事業用の一覧に並ぶ SOHO 可の住居は取り込まない（"3階/1LDK/78.83m²" の間取り部分で判定）
        const spec = squash($card.find(".c-result-section__card-spec").text());
        const layoutText = spec.split("/").find((p) => !/階|m²|㎡/.test(p));
        if (business && isResidentialLike(tags, layoutText)) return;
        const id = $card.attr("data-room-id");
        const href = $card.find("a.c-result-section__card-link").attr("href");
        if (!id || !href) throw new Error(`一覧のカードから ID/リンクが取れない: ${$card.html()}`);
        const priceText = squash($card.find(".c-result-section__card-price").text());
        const rent = priceText.match(/^([\d,]+)\s*円/)?.[1];
        items.push({
          sourceListingId: id,
          detailUrl: new URL(href, url).toString(),
          listHash: sha1(
            [
              priceText,
              squash($card.find(".c-result-section__card-cost").text()),
              squash($card.find(".c-result-section__card-spec").text()),
            ].join("|"),
          ),
          price: rent ? (parseYen(`${rent}円`) ?? undefined) : undefined,
        });
      });
    });

    const next = sawEmptyBuilding
      ? undefined
      : $("a.c-result-pagination__next").first().attr("href");
    return {
      items,
      nextPageUrl: next ? new URL(next, url).toString() : null,
      totalCount: null,
    };
  },

  parseDetail(html, url) {
    const $ = cheerio.load(html);
    const id =
      new URL(url).pathname.match(/\/outline\/([A-Za-z0-9]+)\/?$/)?.[1] ??
      $(".p-property[data-room-id]").attr("data-room-id");
    if (!id) throw new Error(`部屋IDが取れない: ${url}`);

    const fields: Record<string, string> = {};
    const readRows = (rowSel: string, headSel: string, bodySel: string) => {
      $(rowSel).each((_, row) => {
        const key = squash($(row).children(headSel).text()).replace(/\s/g, "");
        const body = $(row).children(bodySel).first();
        if (!key || body.length === 0 || fields[key]) return;
        body.find("iframe, button, script").remove();
        body.find("br").replaceWith("\n");
        fields[key] = body
          .text()
          .split("\n")
          .map((line) => squash(line))
          .filter(Boolean)
          .join("\n");
      });
    };
    readRows(
      ".p-property__section-table-row",
      ".p-property__section-table-head",
      ".p-property__section-table-body",
    );
    readRows(
      ".p-outline__section-facilities-table-row",
      ".p-outline__section-facilities-table-head",
      ".p-outline__section-facilities-table-body",
    );
    if (!fields.賃料) throw new Error(`物件概要に賃料がない: ${url}`);

    fields.建物名 ??= squash($("h1.p-property__heading-title").first().text());
    fields.見出し = squash($(".p-property__heading-title-spec").first().text());
    fields.タグ = $(".p-property__heading-tag")
      .toArray()
      .map((el) => squash($(el).text()))
      .join("、");
    fields.最終更新日 = squash($(".p-property__heading-date").first().text());
    fields.物件番号 = $("a.c-subpage-header__pager-link")
      .toArray()
      .map((a) => $(a).attr("href") ?? "")
      .map((h) => h.match(/\/property\/(\d+)/)?.[1])
      .find(Boolean) as string;
    // 本文の「備考」セクション（取引態様はここに書かれている）
    $(".p-property__section-content").each((_, sec) => {
      if (squash($(sec).find("h2.p-property__title").first().text()) !== "備考") return;
      const body = $(sec).find(".js-p-property-section-box-body").first();
      body.find("br").replaceWith("\n");
      fields.備考詳細 = body
        .text()
        .split("\n")
        .map((line) => squash(line))
        .filter(Boolean)
        .join("\n");
    });

    const urls: string[] = [];
    $(".js-c-image-gallery-track .c-image-gallery__slide img").each((_, img) => {
      const src = $(img).attr("data-src") || $(img).attr("src");
      if (src && !src.startsWith("data:")) urls.push(new URL(src, url).toString());
    });

    return { sourceListingId: id, url, fields, imageUrls: [...new Set(urls)] };
  },

  normalize(raw): NormalizedListingInput {
    const f = raw.fields;
    const price = parseYen(f.賃料);
    if (price == null || price <= 0) throw new Error(`賃料が解釈できない: ${f.賃料}`);

    // 用途は詳細URLの ?usage= で決まる（本文は住居・事業用で同じ）
    const tags = (f.タグ ?? "").split("、").filter(Boolean);
    const business = isBusinessUrl(raw.url);
    if (business && isResidentialLike(tags, f.間取り)) {
      // 一覧で除外しているはず。保存済みスナップショットの再パースなどで来たら住居を事業用にしない
      throw new Error(`SOHO可の住居は事業用として取り込まない: ${raw.url}`);
    }

    // 事業用は「保証金/礼金」表記のことがある（保証金は敷金と同じく deposit に入れ、表記は extra に残す）
    const [depositText, keyMoneyText] = (f["敷金/礼金"] ?? f["保証金/礼金"] ?? "").split(/[／/]/);
    const stations = (f.交通 ?? "")
      .split("\n")
      .map((line) => parseStationAccess(line))
      .filter((s): s is StationAccess => s != null);
    const addressRaw = (f.所在地 ?? "").replace(/\s+/g, "");
    // 見出し "(6階 2LDK 52.64m²)" から所在階
    const floorMatch = (f.見出し ?? "").match(/(地下)?\s*(\d+)\s*階/);
    const floor = floorMatch ? parseFloor(floorMatch[0]).floor : null;
    const mode = (f.備考詳細 ?? f.備考 ?? "").match(/取引態様[\s：:]*([^\s》」)）]+)/)?.[1];

    const featureText = [f.室内設備, f.共有設備, f.通信関係, f.条件, f.タグ, f.備考].join("、");

    const extraKeys = [
      "物件番号",
      "見出し",
      "総戸数",
      "施工",
      "条件",
      "保証会社",
      "備考",
      "学区",
      "タグ",
      "通信関係",
      "保証金/礼金",
      "償却",
    ];
    const extra: Record<string, string> = Object.fromEntries(
      extraKeys.filter((k) => f[k]).map((k) => [k, f[k] as string]),
    );
    if (business) {
      // 事業用は「1R」「ワンフロア」など区画の表記で間取りの概念がないため、表記どおり extra に残す
      if (f.間取り) extra.間取り表記 = f.間取り;
      const uses = tags.filter((t) => t === "事務所" || t === "店舗");
      if (uses.length > 0) extra.用途 = uses.join("・");
    }

    return {
      source: SOURCE_ID,
      sourceListingId: raw.sourceListingId,
      url: raw.url,
      dealType: "rent",
      title: f.物件名 || f.建物名 || null,
      address: { ...splitAddress(addressRaw), raw: addressRaw },
      stations,
      price,
      managementFee: parseYen(f.管理費),
      deposit: parseMonthsOrYen(depositText, price),
      keyMoney: parseMonthsOrYen(keyMoneyText, price),
      layout: business ? null : parseLayout(f.間取り),
      areaSqm: parseAreaSqmOrTsubo(f.面積 ?? f.専有面積),
      builtYearMonth: parseBuiltYearMonth(f.築年月),
      floor,
      totalFloors: parseTotalFloors(f.構造),
      structure: parseStructure(f.構造),
      direction: null, // サイトに向きの記載がない
      features: [...new Set(extractFeatures(featureText))],
      transactionMode: (mode && TRANSACTION_MODES[mode]) || "unknown",
      adAllowed: null,
      agencyName: "アクセルホーム",
      imageUrls: raw.imageUrls,
      sourceUpdatedAt: parseJpDate(f.最終更新日),
      repairReserveFee: null,
      propertyType: business ? "other" : "mansion",
      usage: business ? "business" : "residential",
      extra,
    };
  },
});
