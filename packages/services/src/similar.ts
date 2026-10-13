import {
  type NormalizedListing,
  propertySimilarity,
  SearchCondition,
  scoreListing,
} from "@devote/core";
import { type Db, properties, searchConditions } from "@devote/db";
import { and, desc, eq, ne } from "drizzle-orm";

export interface SimilarCandidate {
  propertyId: string;
  similarity: number;
  /** ユーザー条件でのスコア（条件未登録なら null） */
  conditionScore: number | null;
  combined: number;
  listing: NormalizedListing;
}

/**
 * 「対応不可」になった物件の代わりに提案する類似物件。
 * - 同じ取引種別・掲載中の物件から、物件同士の類似度とユーザー条件スコアを合成して並べる
 * - 客付NGだった元付業者（excludeAgency）の物件は除外する
 */
export async function findSimilarProperties(
  db: Db,
  propertyId: string,
  opts: { userId?: string; excludeAgency?: string | null; limit?: number } = {},
): Promise<SimilarCandidate[]> {
  const [origin] = await db.select().from(properties).where(eq(properties.id, propertyId));
  if (!origin) return [];
  const base = origin.data as NormalizedListing;

  let condition: SearchCondition | null = null;
  if (opts.userId) {
    const [c] = await db
      .select()
      .from(searchConditions)
      .where(and(eq(searchConditions.userId, opts.userId), eq(searchConditions.active, true)))
      .orderBy(desc(searchConditions.version))
      .limit(1);
    const parsed = c ? SearchCondition.safeParse(c.condition) : null;
    condition = parsed?.success ? parsed.data : null;
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
    const l = c.data as NormalizedListing;
    if (opts.excludeAgency && l.agencyName === opts.excludeAgency) continue;
    const similarity = propertySimilarity(base, l);
    if (similarity < 0.5) continue;
    let conditionScore: number | null = null;
    if (condition) {
      const m = scoreListing(l, condition);
      // 条件を許容幅すら超えて外れる物件は提案しない
      if (m.excluded) continue;
      conditionScore = m.score;
    }
    const combined =
      conditionScore == null ? similarity : 0.5 * similarity + 0.5 * (conditionScore / 100);
    results.push({ propertyId: c.id, similarity, conditionScore, combined, listing: l });
  }
  return results.sort((a, b) => b.combined - a.combined).slice(0, opts.limit ?? 5);
}
