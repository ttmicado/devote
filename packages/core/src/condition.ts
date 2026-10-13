import { z } from "zod";
import { DealType, PropertyUse } from "./property";

/**
 * AIヒアリングで固めた希望条件。
 * - hard: 絶対条件。満たさない物件は除外（ただし tolerance の範囲内なら減点で残す）
 * - soft: あったら嬉しい条件。満たすと加点、重み weight は 0〜1
 *
 * 例:「70㎡以上」に対し「69.5㎡ならOK」→ minAreaSqm: 70, tolerance.areaSqm: 0.5
 */
export const SearchCondition = z.object({
  dealType: DealType,
  /** 住まいか事業用（オフィス・店舗）か。事業用は賃貸のみ対応 */
  usage: PropertyUse.default("residential"),
  areas: z.object({
    stations: z.array(z.string()), // 希望駅（正規化済み駅名）
    cities: z.array(z.string()), // 希望市区町村
    /** 希望の町名（例: "南麻布"）。指定があれば、希望の区の中でもこの町に絞る（駅で当たる物件は残す） */
    towns: z.array(z.string()).default([]),
    /** 外したい町名。駅・区で当たっても除外する */
    excludeTowns: z.array(z.string()).default([]),
  }),
  hard: z.object({
    maxPrice: z.number().int().positive().nullable(), // 円（賃料は管理費込みで比較）
    minAreaSqm: z.number().positive().nullable(),
    maxWalkMinutes: z.number().int().positive().nullable(),
    layouts: z.array(z.string()), // 空配列 = 指定なし
    /** 部屋数の下限（「2LDK以上」→ 2）。layouts と併用したときは、どちらかを満たせばよい */
    minRooms: z.number().int().positive().nullable().default(null),
    /** 入居（引渡し）希望時期 "YYYY-MM"。これより後に空く物件は除外する */
    moveInBy: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable()
      .default(null),
    /** 契約の条件: 法人契約か個人契約か、定期借家を許容するか */
    contract: z
      .object({
        corporate: z.enum(["corporate", "individual", "either"]).default("either"),
        fixedTerm: z.enum(["ok", "ng"]).default("ok"),
      })
      .default({ corporate: "either", fixedTerm: "ok" }),
    /** 駐車場: 必要な台数（0 = 不要）と、車種などの補足（機械式に入るかの確認用） */
    parking: z
      .object({
        count: z.number().int().nonnegative().default(0),
        note: z.string().nullable().default(null),
      })
      .default({ count: 0, note: null }),
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

/**
 * 確定に必要な最低限の条件。これがそろわないまま確定すると、物件が大量に届いてしまう。
 * - エリア（区または駅）
 * - ご予算（上限）
 * - 広さか間取り
 */
export type Essential = "area" | "budget" | "size";

export const ESSENTIAL_LABELS: Record<Essential, string> = {
  area: "エリア",
  budget: "ご予算",
  size: "広さか間取り",
};

export function missingEssentials(c: SearchCondition): Essential[] {
  const missing: Essential[] = [];
  if (c.areas.cities.length + c.areas.stations.length + (c.areas.towns ?? []).length === 0)
    missing.push("area");
  if (c.hard.maxPrice == null) missing.push("budget");
  if (c.hard.minAreaSqm == null && c.hard.layouts.length === 0 && c.hard.minRooms == null)
    missing.push("size");
  return missing;
}

/** 掲載中の該当件数がこれを超えたら「多め」として、絞り込みを提案する */
export const MANY_MATCHES = 30;
