import type { NormalizedListing } from "@devote/core";
import { getDb, properties } from "@devote/db";
import { and, between, desc, eq, gte, sql } from "drizzle-orm";
import { crawlSummary } from "@/lib/stats";

export type CrawlSummary = Awaited<ReturnType<typeof crawlSummary>>;
export type SampleListing = { id: string; listing: NormalizedListing; photo: string };

/** 間取り図・ロゴ等を避け、室内や外観の写真らしい URL を選ぶ */
const NOT_PHOTO = /imgfile\.php|\.svg|\.gif|\.png|mpic|madori|layout/i;
const pickPhoto = (urls: string[]) => urls.find((u) => !NOT_PHOTO.test(u)) ?? null;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};

/** 見本カードに使う、写真のある掲載中の物件（建物の重複を除いて最大3件） */
async function sampleListings(): Promise<SampleListing[]> {
  const rows = await getDb()
    .select({ id: properties.id, data: properties.data })
    .from(properties)
    .where(
      and(
        eq(properties.status, "active"),
        eq(properties.dealType, "rent"),
        gte(properties.areaSqm, 55),
        between(properties.price, 300_000, 700_000),
        sql`jsonb_array_length(${properties.data}->'imageUrls') > 0`,
      ),
    )
    .orderBy(desc(properties.updatedAt))
    .limit(120);
  // 掲載元が偏らないよう、まず掲載元ごとに1件ずつ選ぶ
  const candidates = rows.flatMap((r) => {
    const listing = r.data as NormalizedListing;
    const photo = pickPhoto(listing.imageUrls);
    return photo ? [{ id: r.id, listing, photo }] : [];
  });
  const picked: SampleListing[] = [];
  const hosts = new Set<string>();
  const titles = new Set<string>();
  for (const pass of [true, false]) {
    for (const c of candidates) {
      if (picked.length === 3) break;
      const title = c.listing.title ?? c.id;
      if (titles.has(title) || (pass && hosts.has(hostOf(c.photo)))) continue;
      titles.add(title);
      hosts.add(hostOf(c.photo));
      picked.push(c);
    }
  }
  // 総額の安い順に並べる（見本の吹き出しの文言と揃える）
  return picked.sort(
    (a, b) =>
      a.listing.price +
      (a.listing.managementFee ?? 0) -
      (b.listing.price + (b.listing.managementFee ?? 0)),
  );
}

/** トップページの実データ。DB に届かない時も画面は崩さない */
export async function loadHomeData(): Promise<{
  crawl: CrawlSummary | null;
  samples: SampleListing[];
}> {
  const [crawl, samples] = await Promise.all([
    crawlSummary().catch(() => null),
    sampleListings().catch(() => []),
  ]);
  return { crawl, samples };
}
