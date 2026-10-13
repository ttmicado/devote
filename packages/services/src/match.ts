import {
  type NormalizedListing,
  PHASE_GATE,
  type SearchCondition,
  SearchCondition as SearchConditionSchema,
  scoreListing,
} from "@devote/core";
import { type Db, matches, properties, searchConditions } from "@devote/db";
import { and, desc, eq, sql } from "drizzle-orm";

/** マッチとして保存する最低点（exploring の閾値より少し下まで保存しておく） */
const MIN_STORE_SCORE = Math.min(...Object.values(PHASE_GATE).map((g) => g.minScore)) - 10;

/** ユーザーごとの最新の有効な条件 */
export async function activeConditions(db: Db) {
  const rows = await db
    .selectDistinctOn([searchConditions.userId])
    .from(searchConditions)
    .where(eq(searchConditions.active, true))
    .orderBy(searchConditions.userId, desc(searchConditions.version));
  return rows.flatMap((r) => {
    const parsed = SearchConditionSchema.safeParse(r.condition);
    return parsed.success ? [{ ...r, condition: parsed.data }] : [];
  });
}

/** 全ユーザーの有効な条件 × 掲載中の物件 でスコアを計算し、matches に保存する */
export async function runMatching(db: Db, now = new Date(), opts: { userId?: string } = {}) {
  const conds = (await activeConditions(db)).filter(
    (c) => !opts.userId || c.userId === opts.userId,
  );
  if (conds.length === 0) return { conditions: 0, matched: 0 };
  const props = await db
    .select({ id: properties.id, data: properties.data })
    .from(properties)
    .where(eq(properties.status, "active"));

  let matched = 0;
  for (const c of conds) {
    const rows = props.flatMap((p) => {
      const m = scoreListing(p.data as NormalizedListing, c.condition, now);
      if (m.excluded || m.score < MIN_STORE_SCORE) return [];
      return [
        {
          userId: c.userId,
          propertyId: p.id,
          conditionVersion: c.version,
          score: m.score,
          reasons: m.reasons,
        },
      ];
    });
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(matches)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [matches.userId, matches.propertyId, matches.conditionVersion],
          set: { score: sql`excluded.score`, reasons: sql`excluded.reasons` },
        });
    }
    matched += rows.length;
  }
  return { conditions: conds.length, matched };
}

export interface PreviewResult {
  total: number;
  /** 許容幅のおかげで残っている（理想からは外れる）件数 */
  withCompromise: number;
  /** 除外理由の上位（条件を緩める相談に使う） */
  topExclusions: { reason: string; count: number }[];
  samples: { id: string; score: number; summary: string; reasons: string[] }[];
}

/** AIチャットの preview_matches ツール: 下書き条件でヒット件数を試算する */
export async function previewMatches(
  db: Db,
  cond: SearchCondition,
  summarize: (l: NormalizedListing) => string,
): Promise<PreviewResult> {
  const props = await db
    .select({ id: properties.id, data: properties.data })
    .from(properties)
    .where(and(eq(properties.status, "active"), eq(properties.dealType, cond.dealType)));
  const exclusions = new Map<string, number>();
  const hits: PreviewResult["samples"] = [];
  let withCompromise = 0;
  for (const p of props) {
    const l = p.data as NormalizedListing;
    const m = scoreListing(l, cond);
    if (m.excluded) {
      const r = m.reasons[0] ?? "除外";
      exclusions.set(r, (exclusions.get(r) ?? 0) + 1);
      continue;
    }
    if (m.reasons.length > 0) withCompromise++;
    hits.push({ id: p.id, score: m.score, summary: summarize(l), reasons: m.reasons });
  }
  hits.sort((a, b) => b.score - a.score);
  return {
    total: hits.length,
    withCompromise,
    topExclusions: [...exclusions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
    samples: hits.slice(0, 5),
  };
}
