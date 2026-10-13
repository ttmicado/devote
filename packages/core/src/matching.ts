import { PHASE_GATE, type SearchCondition, type SearchPhase } from "./condition";
import { featureLabel, featureSubject, negotiableVariant } from "./features";
import { formatYen } from "./format";
import { buildingAgeYears } from "./normalize";
import type { NormalizedListing } from "./property";

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
/** 値が掲載元にない・要確認のときの小さな減点 */
const UNKNOWN_PENALTY = 3;
/** 必須の入居条件が「要相談」のときの減点 */
const NEGOTIABLE_PENALTY = 5;

/** 町名の比較（丁目・全角半角・空白の揺れを吸収）。"上目黒二丁目" と "上目黒" は同じ町 */
function normalizeTown(t: string): string {
  return t
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[0-9一二三四五六七八九十]+丁目.*$/, "")
    .replace(/[0-9-]+$/, "");
}

export function townMatches(listingTown: string | null | undefined, wanted: string): boolean {
  if (!listingTown) return false;
  const a = normalizeTown(listingTown);
  const b = normalizeTown(wanted);
  return a !== "" && b !== "" && (a.startsWith(b) || b.startsWith(a));
}

/** 間取りの部屋数（"2LDK" → 2、"1R" → 1） */
export function roomsOf(layout: string | null | undefined): number | null {
  const m = layout?.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 比較に使う総額（賃貸は管理費込み、売買は価格） */
export function totalPrice(l: Pick<NormalizedListing, "dealType" | "price" | "managementFee">) {
  return l.price + (l.dealType === "rent" ? (l.managementFee ?? 0) : 0);
}

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
  if ((listing.usage ?? "residential") !== (cond.usage ?? "residential")) {
    return exclude("用途（住まい／事業用）が異なる");
  }

  const { stations, cities } = cond.areas;
  const towns = cond.areas.towns ?? [];
  const excludeTowns = cond.areas.excludeTowns ?? [];
  const town = listing.address.town;
  if (excludeTowns.some((t) => townMatches(town, t))) return exclude("外したい町にある");
  if (stations.length > 0 || cities.length > 0 || towns.length > 0) {
    const stationHit = listing.stations.some((s) => stations.includes(s.station));
    const cityHit =
      cities.length === 0 ||
      (listing.address.city != null && cities.includes(listing.address.city));
    if (!stationHit) {
      if (towns.length > 0) {
        // 町名の指定がある → 希望の区の中でも、その町だけ
        if (!cityHit) return exclude("希望エリア外");
        if (town == null) {
          penalty += UNKNOWN_PENALTY;
          reasons.push("町名は要確認");
        } else if (!towns.some((t) => townMatches(town, t))) {
          return exclude("希望の町の外");
        }
      } else if (cities.length === 0 || !cityHit) {
        return exclude("希望エリア外");
      }
    }
  }

  const { hard, tolerance } = cond;

  if (hard.maxPrice != null) {
    // 賃料は管理費込みの総額で判定する
    const total = totalPrice(listing);
    const p = graded(total - hard.maxPrice, tolerance.price, 25);
    if (p === "excluded") return exclude("予算超過");
    if (p > 0) reasons.push(`総額はご希望を${formatYen(total - hard.maxPrice)}上回ります`);
    penalty += p;
  }

  if (hard.minAreaSqm != null) {
    if (listing.areaSqm == null) {
      penalty += 5;
      reasons.push("面積は掲載元に記載がありません");
    } else {
      const p = graded(hard.minAreaSqm - listing.areaSqm, tolerance.areaSqm, 15);
      if (p === "excluded") return exclude("面積不足");
      // 0.05㎡未満の差（表記の丸め程度）は「違い」として出さない
      const short = Number((hard.minAreaSqm - listing.areaSqm).toFixed(1));
      if (p > 0 && short > 0) reasons.push(`面積はご希望より${short}㎡小さめです`);
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
      reasons.push("駅からの距離は掲載元に記載がありません");
    } else {
      const best = Math.min(...walks);
      const p = graded(best - hard.maxWalkMinutes, tolerance.walkMinutes, 15);
      if (p === "excluded") return exclude("駅から遠い");
      if (p > 0)
        reasons.push(`駅から徒歩${best}分。ご希望より${best - hard.maxWalkMinutes}分遠くなります`);
      penalty += p;
    }
  }

  // 間取り: layouts の指定か「N部屋以上」のどちらかを満たせばよい
  const minRooms = hard.minRooms ?? null;
  if (hard.layouts.length > 0 || minRooms != null) {
    const layoutHit = listing.layout != null && hard.layouts.includes(listing.layout);
    const rooms = roomsOf(listing.layout);
    const roomsHit = minRooms != null && rooms != null && rooms >= minRooms;
    if (!layoutHit && !roomsHit) return exclude("間取りが希望外");
  }

  if (hard.maxBuildingAgeYears != null) {
    if (listing.builtYearMonth == null) {
      penalty += UNKNOWN_PENALTY;
      reasons.push("築年数は要確認");
    } else {
      const age = buildingAgeYears(listing.builtYearMonth, now);
      const p = graded(age - hard.maxBuildingAgeYears, tolerance.buildingAgeYears, 10);
      if (p === "excluded") return exclude("築年数超過");
      if (p > 0)
        reasons.push(`築${age}年。ご希望より${age - hard.maxBuildingAgeYears}年古くなります`);
      penalty += p;
    }
  }

  if (hard.minFloor != null) {
    if (listing.floor == null) {
      penalty += UNKNOWN_PENALTY;
      reasons.push("所在階は要確認");
    } else if (listing.floor < hard.minFloor) {
      return exclude("階数が希望未満");
    }
  }

  const features = listing.features;

  // 入居時期: 希望より後に空く物件は除外。不明・相談は要確認
  if (hard.moveInBy) {
    const from = listing.availableFrom ?? null;
    if (from != null && /^\d{4}-\d{2}$/.test(from)) {
      if (from > hard.moveInBy) return exclude("入居時期が合わない");
    } else if (from !== "即入居可") {
      penalty += UNKNOWN_PENALTY;
      reasons.push("入居時期は要確認");
    }
  }

  // 契約: 法人／個人、定期借家の可否
  const contract = hard.contract ?? { corporate: "either", fixedTerm: "ok" };
  if (contract.corporate === "corporate" && features.includes("individual_only")) {
    return exclude("個人契約限定のため法人契約できない");
  }
  if (contract.corporate === "individual" && features.includes("corporate_only")) {
    return exclude("法人契約限定");
  }
  if (
    contract.fixedTerm === "ng" &&
    (listing.contractType === "fixed_term" || features.includes("fixed_term"))
  ) {
    return exclude("定期借家");
  }

  // 駐車場: 除外はせず、空きの記載がなければ要確認
  const parking = hard.parking ?? { count: 0, note: null };
  if (parking.count > 0) {
    if (!features.includes("parking")) {
      penalty += 5;
      reasons.push("駐車場の空きは要確認");
    } else if (parking.count >= 2) {
      reasons.push(`駐車場${parking.count}台分の空きは要確認`);
    }
  }

  for (const f of hard.requiredFeatures) {
    if (features.includes(f)) continue;
    const negotiable = negotiableVariant(f);
    if (negotiable && features.includes(negotiable)) {
      // 「ペット可」が必須で、物件は「ペット相談」→ 除外せず、相談が要ることを伝える
      penalty += NEGOTIABLE_PENALTY;
      reasons.push(`${featureSubject(f)}は要相談です`);
      continue;
    }
    return exclude(`必須条件「${featureLabel(f)}」を満たさない`);
  }

  // soft: 要相談の物件は半分だけ加点
  const softHit = (feature: string) => {
    if (features.includes(feature)) return 1;
    const negotiable = negotiableVariant(feature);
    return negotiable && features.includes(negotiable) ? 0.5 : 0;
  };
  const totalWeight = cond.soft.reduce((sum, s) => sum + s.weight, 0);
  const hitWeight = cond.soft.reduce((sum, s) => sum + s.weight * softHit(s.feature), 0);
  const bonus = totalWeight > 0 ? (hitWeight / totalWeight) * SOFT_BONUS_MAX : SOFT_BONUS_MAX / 2;

  const score = Math.max(0, Math.min(100, Math.round(BASE_SCORE - penalty + bonus)));
  return { score, excluded: false, reasons };
}

export interface RankKey {
  score: number;
  /** 物件の登録日時（新しいほど先） */
  createdAt?: Date | string | null;
  /** 総額（安いほど先） */
  totalPrice?: number | null;
}

const time = (d: Date | string | null | undefined) =>
  d == null ? 0 : d instanceof Date ? d.getTime() : Date.parse(d) || 0;

/** お届けの並び順: スコアの高い順 → 新しい物件 → 総額の安い順（上位N件を選ぶところはすべてこれを使う） */
export function compareRank(a: RankKey, b: RankKey): number {
  return (
    b.score - a.score ||
    time(b.createdAt) - time(a.createdAt) ||
    (a.totalPrice ?? Number.POSITIVE_INFINITY) - (b.totalPrice ?? Number.POSITIVE_INFINITY)
  );
}

/** 検討フェーズのゲージで通知対象を絞り込む（compareRank の順・上限件数） */
export function selectForPhase<
  T extends { match: MatchResult; createdAt?: Date | string | null; totalPrice?: number | null },
>(items: T[], phase: SearchPhase): T[] {
  const gate = PHASE_GATE[phase];
  return items
    .filter((i) => !i.match.excluded && i.match.score >= gate.minScore)
    .sort((a, b) =>
      compareRank(
        { score: a.match.score, createdAt: a.createdAt, totalPrice: a.totalPrice },
        { score: b.match.score, createdAt: b.createdAt, totalPrice: b.totalPrice },
      ),
    )
    .slice(0, gate.maxItems);
}

/**
 * エリア・用途・取引種別だけを残した条件（「このエリアに掲載中の物件がそもそも何件あるか」を数える用）。
 * 0件の理由が「データがない」のか「条件が厳しい」のかを見分けるために使う。
 */
export function areaOnlyCondition(cond: SearchCondition): SearchCondition {
  return {
    ...cond,
    hard: {
      ...cond.hard,
      maxPrice: null,
      minAreaSqm: null,
      maxWalkMinutes: null,
      layouts: [],
      maxBuildingAgeYears: null,
      minFloor: null,
      requiredFeatures: [],
      minRooms: null,
      moveInBy: null,
      contract: { corporate: "either", fixedTerm: "ok" },
      parking: { count: 0, note: null },
    },
    soft: [],
  };
}
