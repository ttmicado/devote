import {
  type NormalizedListing,
  normalizeBuildingName,
  propertySimilarity,
  SearchCondition,
  sameAgency,
  scoreListing,
  townMatches,
} from "@devote/core";
import { type Db, inquiries, properties, searchConditions, sentLedger } from "@devote/db";
import { and, desc, eq, ne } from "drizzle-orm";

export interface SimilarCandidate {
  propertyId: string;
  similarity: number;
  /** ユーザー条件でのスコア（条件未登録なら null） */
  conditionScore: number | null;
  combined: number;
  listing: NormalizedListing;
  /** 対応不可になった物件と同じ建物の別住戸 */
  sameBuilding: boolean;
}

/** 対応不可の理由（inquiries.unavailable_reason） */
export type UnavailableReason =
  | "broker_refused"
  | "already_applied"
  | "condition_mismatch"
  | "other";

/** 申込済みのとき、同じ建物の別住戸に足す点（同じ建物を気に入っている可能性が高い） */
const SAME_BUILDING_BOOST = 0.15;

/** 同じ建物か（建物名の表記揺れを吸収し、所在地の区・町も一致すること） */
export function sameBuilding(a: NormalizedListing, b: NormalizedListing): boolean {
  const na = normalizeBuildingName(a.title);
  if (na === "" || na !== normalizeBuildingName(b.title)) return false;
  if (a.address.city == null || a.address.city !== b.address.city) return false;
  return (
    a.address.town == null || b.address.town == null || townMatches(b.address.town, a.address.town)
  );
}

/**
 * 「対応不可」になった物件の代わりに提案する類似物件。
 * - 同じ取引種別・掲載中の物件から、物件同士の類似度とユーザー条件スコアを合成して並べる
 * - 客付NGだった元付業者（excludeAgency）の物件は除外する（会社名の表記揺れは吸収する）
 * - 申込済み（already_applied）のときは、同じ建物の別住戸を優先する
 * - そのユーザーに送ったことのある物件・問い合わせ済みの物件は除く
 */
export async function findSimilarProperties(
  db: Db,
  propertyId: string,
  opts: {
    userId?: string;
    excludeAgency?: string | null;
    limit?: number;
    /** 省略時は、そのユーザーのこの物件への問い合わせから読む */
    unavailableReason?: UnavailableReason | null;
  } = {},
): Promise<SimilarCandidate[]> {
  const [origin] = await db.select().from(properties).where(eq(properties.id, propertyId));
  if (!origin) return [];
  const base = origin.data as NormalizedListing;

  let condition: SearchCondition | null = null;
  const seen = new Set<string>();
  let reason = opts.unavailableReason ?? null;
  if (opts.userId) {
    const [c] = await db
      .select()
      .from(searchConditions)
      .where(and(eq(searchConditions.userId, opts.userId), eq(searchConditions.active, true)))
      .orderBy(desc(searchConditions.version))
      .limit(1);
    const parsed = c ? SearchCondition.safeParse(c.condition) : null;
    condition = parsed?.success ? parsed.data : null;

    const sent = await db
      .select({ propertyId: sentLedger.propertyId })
      .from(sentLedger)
      .where(eq(sentLedger.userId, opts.userId));
    const asked = await db
      .select({
        propertyId: inquiries.propertyId,
        status: inquiries.status,
        unavailableReason: inquiries.unavailableReason,
      })
      .from(inquiries)
      .where(eq(inquiries.userId, opts.userId))
      .orderBy(desc(inquiries.updatedAt));
    for (const r of [...sent, ...asked]) seen.add(r.propertyId);
    if (opts.unavailableReason === undefined) {
      reason =
        asked.find((q) => q.propertyId === propertyId && q.status === "unavailable")
          ?.unavailableReason ?? null;
    }
  }

  const candidates = await db
    .select({ id: properties.id, data: properties.data })
    .from(properties)
    .where(
      and(
        eq(properties.status, "active"),
        eq(properties.dealType, origin.dealType),
        ne(properties.id, propertyId),
      ),
    );

  const results: SimilarCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    const l = c.data as NormalizedListing;
    if (opts.excludeAgency && sameAgency(l.agencyName, opts.excludeAgency)) continue;
    const building = reason === "already_applied" && sameBuilding(base, l);
    const similarity = propertySimilarity(base, l);
    if (similarity < 0.5 && !building) continue;
    let conditionScore: number | null = null;
    if (condition) {
      const m = scoreListing(l, condition);
      // 条件を許容幅すら超えて外れる物件は提案しない
      if (m.excluded) continue;
      conditionScore = m.score;
    }
    const combined =
      (conditionScore == null ? similarity : 0.5 * similarity + 0.5 * (conditionScore / 100)) +
      (building ? SAME_BUILDING_BOOST : 0);
    results.push({
      propertyId: c.id,
      similarity,
      conditionScore,
      combined,
      listing: l,
      sameBuilding: building,
    });
  }
  return results.sort((a, b) => b.combined - a.combined).slice(0, opts.limit ?? 5);
}
