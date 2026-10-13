import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isInTargetArea, NormalizedListing, parseTotalFloors, withPrefecture } from "@devote/core";
import { describe, expect, it } from "vitest";
import adapter, { isOfficeOrShop } from "./index.js";

const dir = join(import.meta.dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const BASE = "https://www.kencorp.co.jp";
const API = `${BASE}/_api/search/result/`;
const detailUrl = (bldg: string, code: string) => `${BASE}/housing/properties/${bldg}/${code}/`;
const detail = (bldg: string, code: string) =>
  NormalizedListing.parse(
    adapter.normalize(adapter.parseDetail(fixture(`detail-${code}.html`), detailUrl(bldg, code))),
  );
const officeUrl = (bldg: string, code: string) => `${BASE}/office/properties/${bldg}/${code}/`;
const office = (bldg: string, code: string) =>
  NormalizedListing.parse(
    adapter.normalize(
      adapter.parseDetail(fixture(`detail-office-${code}.html`), officeUrl(bldg, code)),
    ),
  );

describe("kencorp queries", () => {
  it("賃貸・売買・事業用 × 区/エリアの検索API URLを作る", () => {
    const urls = adapter.queries().map((q) => adapter.buildListUrl(q));
    expect(urls).toHaveLength(18);
    expect(urls).toContain(
      `${API}?search_type=rent&search_by=district&districts=12&page=1&per_page=50`,
    );
    expect(urls).toContain(
      `${API}?search_type=buy&search_by=area&areas=ginwan02&page=1&per_page=50`,
    );
    // 事業用は区コードは共通、エリアコードは別体系（rinkai03=晴海・勝どき、rinkai02=豊洲・東雲）
    expect(urls).toContain(
      `${API}?search_type=office&search_by=district&districts=12&page=1&per_page=50`,
    );
    expect(urls).toContain(
      `${API}?search_type=office&search_by=area&areas=rinkai03&page=1&per_page=50`,
    );
    expect(urls).toContain(
      `${API}?search_type=office&search_by=area&areas=rinkai02&page=1&per_page=50`,
    );
    expect(urls.some((u) => u.includes("search_type=office") && u.includes("ginwan"))).toBe(false);
  });
});

describe("kencorp parseList（内部JSON API）", () => {
  const url1 = `${API}?search_type=rent&search_by=area&areas=ginwan02&page=1&per_page=10`;

  it("建物 → 部屋を平らにし、次ページ・総件数を返す", () => {
    const r = adapter.parseList(fixture("list-rent-toyosu-1.json"), url1);
    expect(r.items).toHaveLength(29);
    expect(r.items[0]).toMatchObject({
      sourceListingId: "2017050408",
      detailUrl: detailUrl("184902", "2017050408"),
      price: 410_000,
    });
    expect(r.nextPageUrl).toBe(
      `${API}?search_type=rent&search_by=area&areas=ginwan02&page=2&per_page=10`,
    );
    expect(r.totalCount).toBe(40);
  });

  it("最終ページでは nextPageUrl が null。2ページ合計が総件数と一致する", () => {
    const r1 = adapter.parseList(fixture("list-rent-toyosu-1.json"), url1);
    const r2 = adapter.parseList(
      fixture("list-rent-toyosu-2.json"),
      url1.replace("page=1", "page=2"),
    );
    expect(r2.nextPageUrl).toBeNull();
    expect(r1.items.length + r2.items.length).toBe(r2.totalCount);
  });

  it("売買の価格（万円）を円に直す", () => {
    const r = adapter.parseList(
      fixture("list-sale-toyosu-1.json"),
      `${API}?search_type=buy&search_by=area&areas=ginwan02&page=1&per_page=50`,
    );
    expect(r.items).toHaveLength(10);
    expect(r.items.find((i) => i.sourceListingId === "2026095145")?.price).toBe(205_000_000);
    expect(r.nextPageUrl).toBeNull();
  });

  it("JSON でない応答は throw する", () => {
    expect(() => adapter.parseList("<html></html>", url1)).toThrow(/JSON/);
  });
});

describe("kencorp normalize", () => {
  it("賃貸の詳細を正規化する", () => {
    expect(detail("158244", "2008051357")).toMatchSnapshot();
  });

  it("売買（マンション）の詳細を正規化する", () => {
    expect(detail("183198", "2026095145")).toMatchSnapshot();
  });

  it("売買: 「2億500万円」「月額30,020円」「地上32階 地下1階建 / 22階部分」を吸収する", () => {
    const n = detail("183198", "2026095145");
    expect(n).toMatchObject({
      dealType: "sale",
      price: 205_000_000,
      managementFee: 30_020,
      repairReserveFee: 25_890,
      floor: 22,
      totalFloors: 32,
      structure: "RC",
      propertyType: "mansion",
      transactionMode: "brokerage",
      deposit: null,
      keyMoney: null,
    });
    expect(n.imageUrls).toHaveLength(29);
    expect(n.imageUrls).toContain(`${BASE}/images/building/183198/183198_q1.jpg`); // 外観
    expect(n.imageUrls).toContain(`${BASE}/images/property/20260951/2026095145/2026095145_z1.gif`); // 間取り図
  });

  it("売買: 一戸建ては延床面積・propertyType=house、見出しから間取りを除いて建物名にする", () => {
    const n = detail("215388", "2026055097");
    expect(n).toMatchObject({
      dealType: "sale",
      title: "渋谷区恵比寿3丁目一戸建",
      price: 188_000_000,
      areaSqm: 83.46,
      layout: "2SLDK",
      propertyType: "house",
      structure: "W",
      totalFloors: 3,
      floor: null,
      managementFee: null,
    });
  });

  it("賃貸: 「256,000円 / 20,000円」「1ヶ月 / 無」、都道府県のない住所を補う", () => {
    const n = detail("216638", "2026090248");
    expect(n).toMatchObject({
      dealType: "rent",
      title: "テラス神田猿楽町",
      price: 256_000,
      managementFee: 20_000,
      deposit: 256_000,
      keyMoney: 0,
      layout: "2LDK",
      direction: "南西",
      floor: 3,
      totalFloors: 13,
      builtYearMonth: "2026-09",
      address: { prefecture: "東京都", city: "千代田区", town: "神田猿楽町" },
    });
    expect(n.features).toEqual(
      expect.arrayContaining(["pet_negotiable", "corner_room", "south_facing"]),
    );
    expect(isInTargetArea(n.address.raw)).toBe(true);
  });

  it("価格も賃料もない詳細は throw する", () => {
    expect(() =>
      adapter.parseDetail("<div class='main co-ho-pr'></div>", detailUrl("1", "2")),
    ).toThrow();
  });
});

describe("kencorp helpers", () => {
  it("withPrefecture", () => {
    expect(withPrefecture("千代田区神田猿楽町２")).toBe("東京都千代田区神田猿楽町2");
    expect(withPrefecture("横浜市中区山手町")).toBe("神奈川県横浜市中区山手町");
    expect(withPrefecture("東京都港区赤坂")).toBe("東京都港区赤坂");
  });
  it("parseTotalFloors", () => {
    expect(parseTotalFloors("地上32階 地下1階建")).toBe(32);
    expect(parseTotalFloors("地上13階建")).toBe(13);
  });
});

describe("kencorp 事業用（事務所・店舗）", () => {
  const officeList = `${API}?search_type=office&search_by=area&areas=rinkai03&page=1&per_page=50`;

  it("一覧: 賃料「相談」と事務所・店舗以外（倉庫のみ）を除外し、月額費用から共益費を引いて賃料にする", () => {
    const r = adapter.parseList(fixture("list-office-harumi-kachidoki-1.json"), officeList);
    // 43区画のうち賃料が数値なのは6区画（鎌田ビル5・CROSS DOCK HARUMI 1）
    expect(r.items.map((i) => i.sourceListingId)).toEqual([
      "2146100002",
      "2146100003",
      "2146100004",
      "2146100006",
      "2146100005",
      "1924090011",
    ]);
    expect(r.items[0]).toMatchObject({
      detailUrl: officeUrl("214610", "2146100002"),
      price: 495_000, // 月額費用 500,500 − 共益費 5,500
    });
    // 除外があるので件数照合はしない
    expect(r.totalCount).toBeNull();
    expect(r.nextPageUrl).toBeNull();
  });

  it("事務所: 「453,420円 /月」「共益費 込」「6ヶ月 / なし」「27.48坪 (90.84㎡)」", () => {
    const n = office("101445", "1014450005");
    expect(n).toMatchSnapshot();
    expect(n).toMatchObject({
      usage: "business",
      dealType: "rent",
      propertyType: "other",
      title: "イーグル西新橋ビル",
      price: 453_420,
      managementFee: 0,
      deposit: 2_720_520, // 保証金6ヶ月
      keyMoney: 0,
      layout: null,
      areaSqm: 90.84,
      floor: 2,
      totalFloors: 7,
      structure: "RC",
      builtYearMonth: "1987-04",
    });
    expect(n.extra).toMatchObject({
      用途: "事務所",
      面積: "27.48坪 (90.84㎡)",
      月額費用: "453,420円（税込）",
      募集区画: "2階",
    });
    expect(isInTargetArea(n.address.raw)).toBe(true);
  });

  it("店舗: 共益費別・保証金12ヶ月・償却10%、見出しから募集区画を除いて建物名にする", () => {
    const n = office("212623", "2126230021");
    expect(n).toMatchObject({
      usage: "business",
      title: "TORANOGATE",
      price: 1_999_800,
      managementFee: 176_548,
      deposit: 23_997_600,
      keyMoney: 1_999_800,
      areaSqm: 100.16,
      floor: 1,
      totalFloors: 29,
      layout: null,
    });
    expect(n.extra).toMatchObject({ 用途: "店舗", 償却: "10%", 募集区画: "1階 7-1号" });
  });

  it("「ネット面積」表記・建物名に括弧を含む物件", () => {
    const n = office("208956", "2089560063");
    expect(n).toMatchObject({
      title: "麻布台ヒルズ レジデンスB(S-Office)",
      areaSqm: 105,
      price: 2_026_288,
      managementFee: 209_616,
      floor: 4,
      totalFloors: 64,
    });
    expect(n.imageUrls.length).toBeGreaterThan(0);
  });

  it("賃料「相談」は throw する。用途が事務所・店舗でなければ throw する", () => {
    expect(() => office("216946", "2169460001")).toThrow(/賃料/);
    const raw = adapter.parseDetail(
      fixture("detail-office-1014450005.html"),
      officeUrl("101445", "1014450005"),
    );
    expect(() => adapter.normalize({ ...raw, fields: { ...raw.fields, 用途: "SOHO" } })).toThrow(
      /用途/,
    );
  });

  it("複数用途「事務所 / 店舗」（改行入り）を「事務所・店舗」にまとめる", () => {
    const raw = adapter.parseDetail(
      fixture("detail-office-1014450005.html"),
      officeUrl("101445", "1014450005"),
    );
    const n = adapter.normalize({ ...raw, fields: { ...raw.fields, 用途: "事務所\n/\n店舗" } });
    expect(n.extra?.用途).toBe("事務所・店舗");
    expect(n.usage).toBe("business");
  });

  it("住居（/housing/）の詳細は residential のまま、事業用（/office/）は住居として取り込まない", () => {
    for (const [b, c] of [
      ["158244", "2008051357"],
      ["216638", "2026090248"],
      ["183198", "2026095145"],
      ["215388", "2026055097"],
    ] as const) {
      expect(detail(b, c).usage).toBe("residential");
    }
    for (const [b, c] of [
      ["101445", "1014450005"],
      ["212623", "2126230021"],
      ["208956", "2089560063"],
    ] as const) {
      expect(office(b, c).usage).toBe("business");
    }
    // 住居の一覧は従来どおり（除外・件数照合の挙動が変わらない）
    const r = adapter.parseList(
      fixture("list-rent-toyosu-1.json"),
      `${API}?search_type=rent&search_by=area&areas=ginwan02&page=1&per_page=10`,
    );
    expect(r.items).toHaveLength(29);
    expect(r.items.every((i) => i.detailUrl.includes("/housing/"))).toBe(true);
  });

  it.each([
    [["1", "0", "0"], true],
    [["2", "0", "0"], true],
    [["1", "2", "9"], true],
    [["4", "0", "0"], false], // SOHO のみ
    [["8", "0", "0"], false], // 倉庫・工場のみ
    [["9", "0", "0"], false], // その他のみ
    [undefined, false],
  ])("isOfficeOrShop(%j) → %s", (uses, expected) => {
    expect(isOfficeOrShop(uses)).toBe(expected);
  });
});
