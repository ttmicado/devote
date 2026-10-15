import { TARGET_AREAS } from "./areas";
import type { SearchCondition } from "./condition";
import type { DealType } from "./property";

/**
 * 会員サイト（レインズ・ITANDI BB）の検索範囲。
 *
 * 会員サイトの物件は一般公開せず、希望条件を持つユーザーへの提案にだけ使う。
 * そこで「いまいるユーザーの希望条件」から検索範囲を作り、どのユーザーにも合わない物件は最初から検索しない
 * （レインズは詳細の取得に月間の上限があり、全件では追いつかないため）。
 *
 * 範囲は matching（scoreListing）で必ず除外される物件だけを外すように作る。
 * 迷う場合は広げる（取りこぼしより取得件数の増加を選ぶ）。
 */
export interface CrawlScope {
  dealType: DealType;
  prefecture: string;
  city: string;
  /** TARGET_AREAS の町名指定（勝どき・豊洲）。null は区全体 */
  town: string | null;
  /** 価格・賃料の上限（円）。null = 上限なし */
  maxPrice: number | null;
  /** 面積の下限（㎡）。null = 下限なし */
  minAreaSqm: number | null;
  /** 部屋数の下限。null = 下限なし */
  minRooms: number | null;
}

/** 間取りの部屋数（"2LDK" → 2、"1R" → 1） */
const roomsOfLayout = (layout: string): number | null => {
  const m = layout.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
};

/** 1つの条件で、この物件が必ず除外される境界（matching と同じ: 上限＋許容幅を超えたら除外 等） */
function boundsOf(c: SearchCondition) {
  const { hard, tolerance } = c;
  const maxPrice = hard.maxPrice != null ? hard.maxPrice + (tolerance.price ?? 0) : null;
  const minAreaSqm =
    hard.minAreaSqm != null ? Math.max(0, hard.minAreaSqm - (tolerance.areaSqm ?? 0)) : null;
  // 間取りは「layouts のどれか」または「minRooms 以上」のどちらかを満たせばよい → 部屋数の下限は両者の最小
  const layoutRooms = hard.layouts.map(roomsOfLayout);
  const candidates = [
    ...(hard.minRooms != null ? [hard.minRooms] : []),
    ...(layoutRooms.every((r): r is number => r != null) ? layoutRooms : []),
  ];
  const hasRoomRule = hard.minRooms != null || hard.layouts.length > 0;
  // layouts に部屋数の読めない表記があれば、部屋数では絞らない
  const unreadable = hard.layouts.length > 0 && layoutRooms.some((r) => r == null);
  const minRooms =
    hasRoomRule && !unreadable && candidates.length > 0 ? Math.min(...candidates) : null;
  return { maxPrice, minAreaSqm, minRooms: minRooms != null && minRooms > 1 ? minRooms : null };
}

/** 条件が対象とするエリア（TARGET_AREAS のうち）。区の指定がない（駅だけ等）ときは全エリア */
function areasOf(c: SearchCondition) {
  const cities = c.areas.cities;
  if (cities.length === 0) return TARGET_AREAS;
  const hit = TARGET_AREAS.filter((a) => cities.includes(a.city));
  // 駅で当たる物件は区の外でも残るので、駅の指定もあれば全エリアを見る
  return c.areas.stations.length > 0 ? TARGET_AREAS : hit;
}

/** 緩い方に寄せる（null = 制限なし が最も緩い） */
const looserMax = (a: number | null, b: number | null) =>
  a == null || b == null ? null : Math.max(a, b);
const looserMin = (a: number | null, b: number | null) =>
  a == null || b == null ? null : Math.min(a, b);

/**
 * 有効な希望条件の一覧から検索範囲を作る。取引種別 × エリア（TARGET_AREAS の単位）ごとに、
 * そのエリアを希望する全ユーザーの条件のうち最も緩い境界をとる。
 * 事業用（オフィス・店舗）の条件は会員サイトの住まいの検索に含めない。
 */
export function crawlScopes(conditions: SearchCondition[]): CrawlScope[] {
  const scopes = new Map<string, CrawlScope>();
  for (const c of conditions) {
    if ((c.usage ?? "residential") !== "residential") continue;
    const b = boundsOf(c);
    for (const a of areasOf(c)) {
      for (const town of a.towns ?? [null]) {
        const key = `${c.dealType}|${a.prefecture}|${a.city}|${town ?? ""}`;
        const prev = scopes.get(key);
        scopes.set(
          key,
          prev
            ? {
                ...prev,
                maxPrice: looserMax(prev.maxPrice, b.maxPrice),
                minAreaSqm: looserMin(prev.minAreaSqm, b.minAreaSqm),
                minRooms: looserMin(prev.minRooms, b.minRooms),
              }
            : {
                dealType: c.dealType,
                prefecture: a.prefecture,
                city: a.city,
                town,
                ...b,
              },
        );
      }
    }
  }
  return [...scopes.values()];
}
