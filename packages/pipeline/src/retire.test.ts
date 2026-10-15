import { createDb, listings, properties } from "@devote/db";
import { eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeRetiredSources, stripSourceImages } from "./retire.js";

// ローカル/CI の Postgres がある場合だけ実行する
const url = process.env.DATABASE_URL;
const db = url ? createDb(url, { max: 1 }) : null;
const PREFIX = `test-retire-${Date.now()}`;

describe.skipIf(!db)("closeRetiredSources", () => {
  afterAll(async () => {
    if (!db) return;
    const rows = await db
      .select({ propertyId: listings.propertyId })
      .from(listings)
      .where(like(listings.source, `${PREFIX}%`));
    await db.delete(listings).where(like(listings.source, `${PREFIX}%`));
    const ids = rows.map((r) => r.propertyId).filter((id): id is string => !!id);
    if (ids.length > 0) await db.delete(properties).where(inArray(properties.id, ids));
  });

  it("やめたソースの掲載を閉じ、ほかのソースで掲載中の物件は残す", async () => {
    if (!db) return;
    const [only, shared] = await db
      .insert(properties)
      .values([
        { dealType: "rent", data: {}, price: 1 },
        { dealType: "rent", data: {}, price: 1 },
      ])
      .returning({ id: properties.id });
    const row = (source: string, id: string, propertyId: string | undefined) => ({
      source,
      sourceListingId: id,
      url: `https://example.com/${id}`,
      propertyId,
      data: {},
      contentHash: "h",
      price: 1,
    });
    await db
      .insert(listings)
      .values([
        row(`${PREFIX}-old`, "a", only?.id),
        row(`${PREFIX}-old`, "b", shared?.id),
        row(`${PREFIX}-live`, "c", shared?.id),
      ]);

    expect(await closeRetiredSources(db, [`${PREFIX}-old`])).toBe(2);
    expect(await closeRetiredSources(db, [`${PREFIX}-old`])).toBe(0); // 2回目は何もしない

    const status = async (id: string | undefined) =>
      (
        await db
          .select()
          .from(properties)
          .where(eq(properties.id, id ?? ""))
      )[0]?.status;
    expect(await status(only?.id)).toBe("closed");
    expect(await status(shared?.id)).toBe("active");
    const live = await db
      .select()
      .from(listings)
      .where(eq(listings.source, `${PREFIX}-live`));
    expect(live[0]?.status).toBe("active");
  });
});

describe.skipIf(!db)("stripSourceImages", () => {
  const SRC = `${PREFIX}-img`;
  afterAll(async () => {
    if (!db) return;
    await db.delete(listings).where(like(listings.source, `${PREFIX}-%`));
    await db.delete(properties).where(sql`${properties.data}->>'source' = ${SRC}`);
  });

  it("写真を取り込まないソースの掲載・物件の写真を消し、他のソースは残す", async () => {
    if (!db) return;
    const data = (source: string) => ({ source, imageUrls: ["https://example.com/a.jpg"] });
    const [p] = await db
      .insert(properties)
      .values({ dealType: "rent", data: data(SRC), price: 1 })
      .returning({ id: properties.id });
    const row = (source: string, id: string) => ({
      source,
      sourceListingId: id,
      url: `https://example.com/${id}`,
      propertyId: p?.id,
      data: data(source),
      contentHash: "h",
      price: 1,
    });
    await db.insert(listings).values([row(SRC, "x"), row(`${PREFIX}-keep`, "y")]);

    expect(await stripSourceImages(db, [SRC])).toBe(1);
    expect(await stripSourceImages(db, [SRC])).toBe(0); // 2回目は何もしない

    const images = async (source: string) =>
      (
        (await db.select().from(listings).where(eq(listings.source, source)))[0]?.data as {
          imageUrls: string[];
        }
      ).imageUrls;
    expect(await images(SRC)).toEqual([]);
    expect(await images(`${PREFIX}-keep`)).toHaveLength(1);
    const prop = (
      await db
        .select()
        .from(properties)
        .where(eq(properties.id, p?.id ?? ""))
    )[0];
    expect((prop?.data as { imageUrls: string[] }).imageUrls).toEqual([]);
  });
});
