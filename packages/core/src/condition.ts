import { z } from "zod";
import { DealType } from "./property.js";

/**
 * AIヒアリングで固めた希望条件。
 * - hard: 絶対条件。満たさない物件は除外（ただし tolerance の範囲内なら減点で残す）
 * - soft: あったら嬉しい条件。満たすと加点、重み weight は 0〜1
 *
 * 例:「70㎡以上」に対し「69.5㎡ならOK」→ minAreaSqm: 70, tolerance.areaSqm: 0.5
 */
export const SearchCondition = z.object({
  dealType: DealType,
  areas: z.object({
    stations: z.array(z.string()), // 希望駅（正規化済み駅名）
    cities: z.array(z.string()), // 希望市区町村
  }),
  hard: z.object({
    maxPrice: z.number().int().positive().nullable(), // 円（賃料は管理費込みで比較）
    minAreaSqm: z.number().positive().nullable(),
    maxWalkMinutes: z.number().int().positive().nullable(),
    layouts: z.array(z.string()), // 空配列 = 指定なし
    maxBuildingAgeYears: z.number().int().nonnegative().nullable(),
    minFloor: z.number().int().nullable(),
    requiredFeatures: z.array(z.string()), // 例: ["pet_ok"]
  }),
  tolerance: z.object({
    price: z.number().nonnegative().default(0), // 円
    areaSqm: z.number().nonnegative().default(0),
    walkMinutes: z.number().int().nonnegative().default(0),
    buildingAgeYears: z.number().int().nonnegative().default(0),
  }),
  soft: z.array(
    z.object({
      feature: z.string(), // 例: "south_facing", "separate_bath_toilet"
      weight: z.number().min(0).max(1),
    }),
  ),
  /** 補足メモ（AIが要約した、構造化しきれない希望） */
  notes: z.string().default(""),
});
export type SearchCondition = z.infer<typeof SearchCondition>;

/**
 * 検討フェーズ（マッチ率ゲージ）。
 * 情報収集段階は広く、内見済みの熱い顧客は厳選して見せる。
 */
export const SearchPhase = z.enum(["exploring", "considering", "ready"]);
export type SearchPhase = z.infer<typeof SearchPhase>;

/** フェーズごとの通知閾値（スコア 0〜100）と1回あたりの最大件数 */
export const PHASE_GATE: Record<SearchPhase, { minScore: number; maxItems: number }> = {
  exploring: { minScore: 50, maxItems: 20 },
  considering: { minScore: 70, maxItems: 8 },
  ready: { minScore: 85, maxItems: 3 },
};
