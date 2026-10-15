import { createHash } from "node:crypto";
import {
  dedupeBlockKey,
  deriveContractFacts,
  isInTargetArea,
  type NormalizedListing,
  sameUnitLikelihood,
} from "@devote/core";
import { changeEvents, type Db, listings, properties } from "@devote/db";
import { type CrawlResult, noImageSourceIds } from "@devote/scraper";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

/** 同一物件とみなす名寄せスコアの閾値 */
const SAME_UNIT_THRESHOLD = 0.8;
/** 一覧で連続して見つからなかったら掲載終了とする回数 */
const DELIST_AFTER_MISSES = 2;

export interface IngestStats {
  inArea: number;
  newCount: number;
  updatedCount: number;
  delistedCount: number;
  warnings: string[];
}

function contentHash(l: NormalizedListing): string {
  const { sourceUpdatedAt: _ignored, ...rest } = l;
  return createHash("sha1").update(JSON.stringify(rest)).digest("hex");
}

/** 比較に使う総額（賃貸は管理費込み） */
function totalOf(l: NormalizedListing): number {
  return l.price + (l.dealType === "rent" ? (l.managementFee ?? 0) : 0);
}

/** change_events に残す価格・条件のスナップショット */
function priceSnapshot(l: NormalizedListing) {
  return {
    price: l.price,
    managementFee: l.managementFee,
    total: totalOf(l),
    keyMoney: l.keyMoney,
    freeRent: l.features.includes("free_rent"),
  };
}

/**
 * 掲載の変化の種類。
 * - 賃貸は管理費込みの総額で値下げ・値上げを判定する（賃料が下がっても管理費が上がれば値下げではない）
 * - 総額が同じでも、礼金が下がった・フリーレントが付いたなどは「条件の改善」（field_changed, after.improved = true）
 */
export function classifyChange(
  before: NormalizedListing,
  after: NormalizedListing,
): { type: "price_down" | "price_up" | "field_changed"; improved: boolean } {
  const b = totalOf(before);
  const a = totalOf(after);
  if (a < b) return { type: "price_down", improved: true };
  if (a > b) return { type: "price_up", improved: false };
  const keyMoneyDown =
    before.keyMoney != null && after.keyMoney != null && after.keyMoney < before.keyMoney;
  const freeRentAdded =
    !(before.features ?? []).includes("free_rent") && after.features.includes("free_rent");
  return { type: "field_changed", improved: keyMoneyDown || freeRentAdded };
}

function propertyColumns(l: NormalizedListing) {
  return {
    dealType: l.dealType,
    dedupeBlockKey: dedupeBlockKey(l),
    data: l,
    price: l.price,
    areaSqm: l.areaSqm,
    layout: l.layout,
    city: l.address.city,
    status: "active" as const,
    updatedAt: new Date(),
  };
}

/** 名寄せ: 同じ部屋の物件があればそのID、なければ新規作成 */
async function resolveProperty(db: Db, l: NormalizedListing): Promise<string> {
  const key = dedupeBlockKey(l);
  if (key) {
    const candidates = await db
      .select({ id: properties.id, data: properties.data })
      .from(properties)
      .where(eq(properties.dedupeBlockKey, key));
    const best = candidates
      .map((c) => ({ id: c.id, s: sameUnitLikelihood(l, c.data as NormalizedListing) }))
      .sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= SAME_UNIT_THRESHOLD) {
      await db.update(properties).set(propertyColumns(l)).where(eq(properties.id, best.id));
      return best.id;
    }
  }
  const [created] = await db
    .insert(properties)
    .values(propertyColumns(l))
    .returning({ id: properties.id });
  if (!created) throw new Error("property insert failed");
  return created.id;
}

/**
 * 1ソースの巡回結果を DB に反映する。
 * - 対象エリア外は保存しない
 * - 新着 / 価格変更 / 項目変更 / 再掲載 を change_events に記録
 * - 一覧を最後まで正常に巡回できた回だけ、見つからなかった掲載の miss_count を進め、掲載終了を判定
 */
export async function ingestCrawl(
  db: Db,
  source: string,
  result: CrawlResult,
): Promise<IngestStats> {
  const stats: IngestStats = {
    inArea: 0,
    newCount: 0,
    updatedCount: 0,
    delistedCount: 0,
    warnings: [],
  };
  const now = new Date();

  for (const raw of result.listings) {
    // extra の表記から入居時期・契約形態・駐車場などを埋める（アダプター共通の後処理）
    const derived = deriveContractFacts(raw, now);
    // 他社の社名・ロゴ入りの写真を使わないソースは写真を外す
    const l = noImageSourceIds.includes(source) ? { ...derived, imageUrls: [] } : derived;
    if (!isInTargetArea(l.address.raw || `${l.address.city ?? ""}${l.address.town ?? ""}`))
      continue;
    stats.inArea++;
    const hash = contentHash(l);
    const listHash = result.listHashes[l.sourceListingId] ?? null;
    const [existing] = await db
      .select()
      .from(listings)
      .where(and(eq(listings.source, source), eq(listings.sourceListingId, l.sourceListingId)));

    if (!existing) {
      const propertyId = await resolveProperty(db, l);
      const [row] = await db
        .insert(listings)
        .values({
          source,
          sourceListingId: l.sourceListingId,
          url: l.url,
          propertyId,
          data: l,
          contentHash: hash,
          listHash,
          price: l.price,
          adAllowed: l.adAllowed,
        })
        .returning({ id: listings.id });
      if (row) {
        await db
          .insert(changeEvents)
          .values({ listingId: row.id, propertyId, type: "new", after: l });
      }
      stats.newCount++;
      continue;
    }

    const before = existing.data as NormalizedListing;
    const relisted = existing.status === "closed";
    const changed = existing.contentHash !== hash;
    if (!changed && !relisted) {
      await db
        .update(listings)
        .set({ lastSeenAt: now, missCount: 0, listHash })
        .where(eq(listings.id, existing.id));
      continue;
    }
    const propertyId = existing.propertyId ?? (await resolveProperty(db, l));
    if (existing.propertyId) {
      await db
        .update(properties)
        .set(propertyColumns(l))
        .where(eq(properties.id, existing.propertyId));
    }
    await db
      .update(listings)
      .set({
        url: l.url,
        data: l,
        contentHash: hash,
        listHash,
        price: l.price,
        adAllowed: l.adAllowed,
        status: "active",
        missCount: 0,
        lastSeenAt: now,
        propertyId,
        updatedAt: now,
      })
      .where(eq(listings.id, existing.id));
    const change = classifyChange(before, l);
    await db.insert(changeEvents).values({
      listingId: existing.id,
      propertyId,
      type: relisted ? "relisted" : change.type,
      before: priceSnapshot(before),
      after: { ...priceSnapshot(l), improved: change.improved },
    });
    stats.updatedCount++;
  }

  // 詳細取得を省略した（listHash が同じ）掲載も「一覧で見えた」ので生存扱い
  if (result.seenIds.length > 0) {
    await db
      .update(listings)
      .set({ lastSeenAt: now, missCount: 0 })
      .where(and(eq(listings.source, source), inArray(listings.sourceListingId, result.seenIds)));
  }

  // 差分検索（レインズ）の一覧は全件ではないので、一覧に出ないことを掲載終了とみなさない
  if (result.partialList) return stats;
  if (!result.listCompleted || result.countMismatch) {
    stats.warnings.push(
      "一覧の巡回が不完全、または総件数と取得件数が不一致のため掲載終了判定をスキップ",
    );
    return stats;
  }
  if (result.seenIds.length === 0) {
    stats.warnings.push("一覧が0件。構造変化の可能性があるため掲載終了判定をスキップ");
    return stats;
  }

  await db
    .update(listings)
    .set({ missCount: sql`${listings.missCount} + 1` })
    .where(
      and(
        eq(listings.source, source),
        eq(listings.status, "active"),
        notInArray(listings.sourceListingId, result.seenIds),
      ),
    );
  const closed = await db
    .update(listings)
    .set({ status: "closed", updatedAt: now })
    .where(
      and(
        eq(listings.source, source),
        eq(listings.status, "active"),
        sql`${listings.missCount} >= ${DELIST_AFTER_MISSES}`,
      ),
    )
    .returning({ id: listings.id, propertyId: listings.propertyId });
  for (const c of closed) {
    await db
      .insert(changeEvents)
      .values({ listingId: c.id, propertyId: c.propertyId, type: "delisted" });
    if (c.propertyId) {
      // ほかのソースでまだ掲載中なら物件は生きている
      await db.execute(sql`
        update properties set status = 'closed', updated_at = now()
        where id = ${c.propertyId}
          and not exists (select 1 from listings where property_id = ${c.propertyId} and status = 'active')`);
    }
  }
  stats.delistedCount = closed.length;
  return stats;
}
