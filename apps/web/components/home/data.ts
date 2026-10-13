import type { NormalizedListing } from "@devote/core";
import { getDb, listings, properties } from "@devote/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { MEMBER_ONLY_SOURCES } from "@/lib/data";
import { crawlSummary } from "@/lib/stats";

export type CrawlSummary = Awaited<ReturnType<typeof crawlSummary>>;
export type SampleListing = { id: string; listing: NormalizedListing; photo: string };

/** 間取り図・ロゴ等を避け、室内や外観の写真らしい URL を選ぶ */
const NOT_PHOTO = /imgfile\.php|\.svg|\.gif|\.png|mpic|madori|layout/i;
/** 写真らしいものが無い時の次善（間取り図・ロゴだけは避ける） */
const NOT_IMAGE = /\.svg|\.gif|madori|layout|logo/i;
const pickPhoto = (urls: string[] = []) =>
  urls.find((u) => !NOT_PHOTO.test(u)) ?? urls.find((u) => !NOT_IMAGE.test(u)) ?? null;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};

/** 見本のご希望（line-phone.tsx の吹き出し）に近い物件ほど先に選ぶ */
function closeness(l: NormalizedListing): number {
  const total = l.price + (l.managementFee ?? 0);
  let score = 0;
  if (l.dealType === "rent") score += 4;
  if (l.usage !== "business") score += 2;
  if (l.areaSqm != null && l.areaSqm >= 55) score += 2;
  if (l.dealType === "rent" && total >= 300_000 && total <= 700_000) score += 2;
  return score;
}

/**
 * 見本カードに使う、写真のある掲載中の物件（建物の重複を除いて最大3件）。
 * 条件に合う物件が少ない時も見本が空にならないよう、絞り込みは並べ替えで行う。
 */
async function sampleListings(): Promise<SampleListing[]> {
  const rows = await getDb()
    .select({ id: properties.id, data: properties.data })
    .from(properties)
    .where(
      and(
        eq(properties.status, "active"),
        // imageUrls が配列でない行があっても失敗しないよう、型を確かめてから長さを見る
        sql`case when jsonb_typeof(${properties.data}->'imageUrls') = 'array' then jsonb_array_length(${properties.data}->'imageUrls') else 0 end > 0`,
        // 一般公開してよい物件だけ（広告不可や、会員サイトにしか載っていない物件は見本に使わない）
        sql`coalesce((${properties.data}->>'adAllowed')::boolean, true)`,
        sql`not exists (select 1 from ${listings} l where l.property_id = ${properties.id} and l.ad_allowed = false)`,
        sql`exists (select 1 from ${listings} l where l.property_id = ${properties.id} and l.source not in (${sql.join(
          MEMBER_ONLY_SOURCES.map((s) => sql`${s}`),
          sql`, `,
        )}))`,
      ),
    )
    .orderBy(desc(properties.updatedAt))
    .limit(200);
  const candidates = rows
    .flatMap((r) => {
      const listing = r.data as NormalizedListing;
      const photo = pickPhoto(listing.imageUrls);
      return photo ? [{ id: r.id, listing, photo }] : [];
    })
    // 安定ソート: 見本のご希望に近い順（同点は更新の新しい順のまま）
    .sort((a, b) => closeness(b.listing) - closeness(a.listing));
  // 掲載元が偏らないよう、まず掲載元ごとに1件ずつ選ぶ
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
  if (picked.length === 0) {
    console.warn(`[home] 見本にできる物件がありません（掲載中で画像のある物件 ${rows.length} 件）`);
  }
  // 総額の安い順に並べる（見本の吹き出しの文言と揃える）
  return picked.sort(
    (a, b) =>
      a.listing.price +
      (a.listing.managementFee ?? 0) -
      (b.listing.price + (b.listing.managementFee ?? 0)),
  );
}

/**
 * トップページの実データ。DB に届かない時（ビルド時に DB が無い等）も画面は崩さない。
 * 失敗は握りつぶさずにログへ残す（本番で見本が空になる原因を追えるように）。
 */
export async function loadHomeData(): Promise<{
  crawl: CrawlSummary | null;
  samples: SampleListing[];
}> {
  if (!process.env.DATABASE_URL) {
    console.warn("[home] DATABASE_URL が未設定のため、実データなしで表示します");
    return { crawl: null, samples: [] };
  }
  const [crawl, samples] = await Promise.all([
    crawlSummary().catch((e) => {
      console.error("[home] 巡回の実績を読めませんでした", e);
      return null;
    }),
    sampleListings().catch((e) => {
      console.error("[home] 見本の物件を読めませんでした", e);
      return [] as SampleListing[];
    }),
  ]);
  return { crawl, samples };
}
