import { NormalizedListing } from "@devote/core";
import { changeEvents, createDb, listings, properties } from "@devote/db";
import type { CrawlResult } from "@devote/scraper";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestCrawl } from "./ingest.js";

// ローカル/CI の Postgres がある場合だけ実行する
const url = process.env.DATABASE_URL;
const db = url ? createDb(url, { max: 1 }) : null;
const PREFIX = `test-ingest-${Date.now()}`;

function listing(id: string, over: Partial<NormalizedListing> = {}, source = `${PREFIX}-a`) {
  return NormalizedListing.parse({
    source,
    sourceListingId: id,
    url: `https://example.com/${id}`,
    dealType: "rent",
    title: `テストレジデンス${id}`,
    address: { prefecture: "東京都", city: "港区", town: "六本木", raw: "東京都港区六本木6丁目" },
    stations: [{ line: null, station: "六本木", walkMinutes: 5, busMinutes: null }],
    price: 300_000,
    managementFee: 20_000,
    deposit: null,
    keyMoney: null,
    layout: "2LDK",
    areaSqm: 70.5,
    builtYearMonth: "2015-04",
    floor: Number(id.replace(/\D/g, "")) || 3,
    totalFloors: 20,
    structure: "RC",
    direction: "南",
    features: [],
    transactionMode: "general_agency",
    adAllowed: null,
    agencyName: null,
    imageUrls: [],
    sourceUpdatedAt: null,
    ...over,
  });
}

function result(ls: NormalizedListing[], seen = ls.map((l) => l.sourceListingId)): CrawlResult {
  return {
    listings: ls,
    errors: [],
    listCompleted: true,
    countMismatch: false,
    seenIds: seen,
    listHashes: Object.fromEntries(seen.map((s) => [s, `h-${s}`])),
    deferred: 0,
    listRequests: 0,
    detailRequests: 0,
    warnings: [],
  };
}

describe.skipIf(!db)("ingestCrawl（DB結合）", () => {
  const A = listing("A1");
  const B = listing("B2", {
    address: { prefecture: "東京都", city: "渋谷区", town: "神宮前", raw: "東京都渋谷区神宮前" },
  });
  const C = listing("C3", {
    address: { prefecture: "東京都", city: "目黒区", town: "上目黒", raw: "東京都目黒区上目黒" },
  });

  beforeAll(async () => {
    expect(db).not.toBeNull();
  });

  afterAll(async () => {
    if (!db) return;
    const ids = await db
      .select({ id: listings.id, p: listings.propertyId })
      .from(listings)
      .where(like(listings.source, `${PREFIX}%`));
    if (ids.length) {
      await db.delete(changeEvents).where(
        inArray(
          changeEvents.listingId,
          ids.map((i) => i.id),
        ),
      );
      await db.delete(listings).where(
        inArray(
          listings.id,
          ids.map((i) => i.id),
        ),
      );
      const pids = ids.map((i) => i.p).filter((p): p is string => p != null);
      if (pids.length) await db.delete(properties).where(inArray(properties.id, pids));
    }
  });

  it("新着: 対象エリア内だけ保存する", async () => {
    const s = await ingestCrawl(db!, `${PREFIX}-a`, result([A, B, C]));
    expect(s).toMatchObject({ inArea: 2, newCount: 2, updatedCount: 0, delistedCount: 0 });
  });

  it("値下げを検知し、一覧から消えた掲載は2回連続で掲載終了", async () => {
    const s1 = await ingestCrawl(db!, `${PREFIX}-a`, result([{ ...A, price: 290_000 }]));
    expect(s1).toMatchObject({ updatedCount: 1, delistedCount: 0 });
    const s2 = await ingestCrawl(db!, `${PREFIX}-a`, result([], ["A1"]));
    expect(s2.delistedCount).toBe(1);

    const rows = await db!
      .select()
      .from(listings)
      .where(like(listings.source, `${PREFIX}-a`));
    const b = rows.find((r) => r.sourceListingId === "B2");
    expect(b?.status).toBe("closed");
    const events = await db!
      .select({ type: changeEvents.type })
      .from(changeEvents)
      .where(
        inArray(
          changeEvents.listingId,
          rows.map((r) => r.id),
        ),
      );
    expect(events.map((e) => e.type).sort()).toEqual(["delisted", "new", "new", "price_down"]);
  });

  it("別ソースの同じ部屋は同じ物件に名寄せする", async () => {
    await ingestCrawl(
      db!,
      `${PREFIX}-b`,
      result([listing("X9", { floor: 15, price: 290_000 }, `${PREFIX}-b`)]),
    );
    const [a] = await db!
      .select()
      .from(listings)
      .where(eq(listings.source, `${PREFIX}-a`))
      .then((r) => r.filter((l) => l.sourceListingId === "A1"));
    // 階が違う → 別の部屋
    const [x] = await db!.select().from(listings).where(eq(listings.sourceListingId, "X9"));
    expect(x?.propertyId).not.toBe(a?.propertyId);

    await ingestCrawl(
      db!,
      `${PREFIX}-c`,
      result([listing("A1", { price: 290_000 }, `${PREFIX}-c`)]),
    );
    const rows = await db!
      .select()
      .from(listings)
      .where(eq(listings.source, `${PREFIX}-c`));
    expect(rows[0]?.propertyId).toBe(a?.propertyId);
  });

  it("listHash が同じで詳細を省略した掲載は生存扱い（掲載終了にしない）", async () => {
    await ingestCrawl(db!, `${PREFIX}-c`, result([], ["A1"]));
    await ingestCrawl(db!, `${PREFIX}-c`, result([], ["A1"]));
    const [row] = await db!
      .select()
      .from(listings)
      .where(eq(listings.source, `${PREFIX}-c`));
    expect(row?.status).toBe("active");
  });
});
