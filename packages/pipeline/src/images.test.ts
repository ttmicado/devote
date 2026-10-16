import { createDb, listings, properties } from "@devote/db";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { fillPropertyImages } from "./images.js";

// ローカル/CI の Postgres がある場合だけ実行する
const url = process.env.DATABASE_URL;
const db = url ? createDb(url, { max: 1 }) : null;
const PREFIX = `test-images-${Date.now()}`;

describe.skipIf(!db)("fillPropertyImages", () => {
  const propertyIds: string[] = [];

  afterAll(async () => {
    if (!db) return;
    await db.delete(listings).where(like(listings.source, `${PREFIX}%`));
    if (propertyIds.length > 0)
      await db.delete(properties).where(inArray(properties.id, propertyIds));
  });

  it("写真のない物件に、同じ部屋のほかのソースの写真を入れる（社名・ロゴ入りのソースは使わない）", async () => {
    if (!db) return;
    const noPhoto = { source: `${PREFIX}-reins`, imageUrls: [] };
    const created = await db
      .insert(properties)
      .values([
        { dealType: "rent", data: noPhoto, price: 1 }, // ほかのソースに写真あり
        { dealType: "rent", data: noPhoto, price: 1 }, // 社名入りのソースにしか写真がない
        { dealType: "rent", data: { imageUrls: ["https://own/1.jpg"] }, price: 1 }, // 写真あり
      ])
      .returning({ id: properties.id });
    const [filled, logoOnly, hasOwn] = created.map((c) => c.id);
    propertyIds.push(...created.map((c) => c.id));

    const row = (source: string, id: string, propertyId: string | undefined, images: string[]) => ({
      source: `${PREFIX}-${source}`,
      sourceListingId: id,
      url: `https://example.com/${id}`,
      propertyId,
      data: { imageUrls: images },
      contentHash: "h",
      price: 1,
    });
    await db
      .insert(listings)
      .values([
        row("reins", "a", filled, []),
        row("clean", "b", filled, ["https://clean/ext.jpg", "https://clean/madori.png"]),
        row("logo", "c", filled, ["https://logo/1.jpg"]),
        row("logo", "d", logoOnly, ["https://logo/2.jpg"]),
        row("clean", "e", hasOwn, ["https://clean/other.jpg"]),
      ]);

    const ids = [...propertyIds];
    expect(await fillPropertyImages(db, [`${PREFIX}-logo`], ids)).toBe(1);
    expect(await fillPropertyImages(db, [`${PREFIX}-logo`], ids)).toBe(0); // 2回目は何もしない

    const images = async (id: string | undefined) => {
      const [p] = await db
        .select({ data: properties.data })
        .from(properties)
        .where(eq(properties.id, id ?? ""));
      return (p?.data as { imageUrls: string[] }).imageUrls;
    };
    expect(await images(filled)).toEqual(["https://clean/ext.jpg", "https://clean/madori.png"]);
    expect(await images(logoOnly)).toEqual([]);
    expect(await images(hasOwn)).toEqual(["https://own/1.jpg"]);
  });
});
