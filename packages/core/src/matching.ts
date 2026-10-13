import { PHASE_GATE, type SearchCondition, type SearchPhase } from "./condition.js";
import { buildingAgeYears } from "./normalize.js";
import type { NormalizedListing } from "./property.js";

export interface MatchResult {
  /** 0〜100。hard 条件を許容幅で外れた分は減点、soft 条件で加点 */
  score: number;
  /** hard 条件を許容幅すら超えて外れた → 除外 */
  excluded: boolean;
  /** ユーザーへの説明用（「面積が0.5㎡足りませんが…」など） */
  reasons: string[];
}

const BASE_SCORE = 80;
const SOFT_BONUS_MAX = 20;

/**
 * 許容幅付きの比較。超過分が tolerance 以内なら比率で減点、超えたら除外。
 * 減点の最大値 maxPenalty はぎりぎり許容内のときに引かれる点数。
 */
function graded(overBy: number, tolerance: number, maxPenalty: number): number | "excluded" {
  if (overBy <= 0) return 0;
  if (tolerance <= 0 || overBy > tolerance) return "excluded";
  return (overBy / tolerance) * maxPenalty;
}

/**
 * ルールベースのスコアリング（第1段階）。
 * 将来は埋め込み類似度・ユーザーの反応履歴と組み合わせたハイブリッドにする（docs/architecture.md）。
 */
export function scoreListing(
  listing: NormalizedListing,
  cond: SearchCondition,
  now: Date = new Date(),
): MatchResult {
  const reasons: string[] = [];
  let penalty = 0;
  const exclude = (reason: string): MatchResult => ({
    score: 0,
    excluded: true,
    reasons: [reason],
  });

  if (listing.dealType !== cond.dealType) return exclude("取引種別が異なる");

  const { stations, cities } = cond.areas;
  if (stations.length > 0 || cities.length > 0) {
    const stationHit = listing.stations.some((s) => stations.includes(s.station));
    const cityHit = listing.address.city != null && cities.includes(listing.address.city);
    if (!stationHit && !cityHit) return exclude("希望エリア外");
  }

  const { hard, tolerance } = cond;

  if (hard.maxPrice != null) {
    // 賃料は管理費込みの総額で判定する
    const total = listing.price + (cond.dealType === "rent" ? (listing.managementFee ?? 0) : 0);
    const p = graded(total - hard.maxPrice, tolerance.price, 25);
    if (p === "excluded") return exclude("予算超過");
    if (p > 0) reasons.push(`予算を${(total - hard.maxPrice).toLocaleString()}円超過`);
    penalty += p;
  }

  if (hard.minAreaSqm != null) {
    if (listing.areaSqm == null) {
      penalty += 5;
      reasons.push("面積不明");
    } else {
      const p = graded(hard.minAreaSqm - listing.areaSqm, tolerance.areaSqm, 15);
      if (p === "excluded") return exclude("面積不足");
      if (p > 0) reasons.push(`面積が${(hard.minAreaSqm - listing.areaSqm).toFixed(1)}㎡不足`);
      penalty += p;
    }
  }

  if (hard.maxWalkMinutes != null) {
    const walks = listing.stations
      .filter((s) => stations.length === 0 || stations.includes(s.station))
      .map((s) => s.walkMinutes)
      .filter((w): w is number => w != null);
    if (walks.length === 0) {
      penalty += 5;
      reasons.push("駅徒歩不明");
    } else {
      const best = Math.min(...walks);
      const p = graded(best - hard.maxWalkMinutes, tolerance.walkMinutes, 15);
      if (p === "excluded") return exclude("駅から遠い");
      if (p > 0) reasons.push(`駅徒歩が${best - hard.maxWalkMinutes}分超過`);
      penalty += p;
    }
  }

  if (hard.layouts.length > 0) {
    if (listing.layout == null || !hard.layouts.includes(listing.layout)) {
      return exclude("間取りが希望外");
    }
  }

  if (hard.maxBuildingAgeYears != null && listing.builtYearMonth != null) {
    const age = buildingAgeYears(listing.builtYearMonth, now);
    const p = graded(age - hard.maxBuildingAgeYears, tolerance.buildingAgeYears, 10);
    if (p === "excluded") return exclude("築年数超過");
    if (p > 0) reasons.push(`築年数が${age - hard.maxBuildingAgeYears}年超過`);
    penalty += p;
  }

  if (hard.minFloor != null && listing.floor != null && listing.floor < hard.minFloor) {
    return exclude("階数が希望未満");
  }

  for (const f of hard.requiredFeatures) {
    if (!listing.features.includes(f)) return exclude(`必須条件「${f}」を満たさない`);
  }

  const totalWeight = cond.soft.reduce((sum, s) => sum + s.weight, 0);
  const hitWeight = cond.soft
    .filter((s) => listing.features.includes(s.feature))
    .reduce((sum, s) => sum + s.weight, 0);
  const bonus = totalWeight > 0 ? (hitWeight / totalWeight) * SOFT_BONUS_MAX : SOFT_BONUS_MAX / 2;

  const score = Math.max(0, Math.min(100, Math.round(BASE_SCORE - penalty + bonus)));
  return { score, excluded: false, reasons };
}

/** 検討フェーズのゲージで通知対象を絞り込む（スコア降順・上限件数） */
export function selectForPhase<T extends { match: MatchResult }>(
  items: T[],
  phase: SearchPhase,
): T[] {
  const gate = PHASE_GATE[phase];
  return items
    .filter((i) => !i.match.excluded && i.match.score >= gate.minScore)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, gate.maxItems);
}
