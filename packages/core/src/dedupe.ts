import type { NormalizedListing } from "./property.js";

/**
 * 同一物件の名寄せキー。
 * 同じ部屋がレインズ・自社サイト・複数ポータルに載るため、
 * 「所在地（町丁目まで）+ 所在階 + 面積（0.5㎡丸め）+ 間取り + 築年」でブロッキングし、
 * 最終判定は候補ペアの類似度（賃料差・建物名の類似など）で行う。
 */
export function dedupeBlockKey(l: NormalizedListing): string | null {
  if (l.areaSqm == null || l.address.city == null) return null;
  const area = (Math.round(l.areaSqm * 2) / 2).toFixed(1);
  return [
    l.dealType,
    l.address.prefecture ?? "",
    l.address.city,
    l.address.town ?? "",
    l.floor ?? "",
    area,
    l.layout ?? "",
    l.builtYearMonth?.slice(0, 4) ?? "",
  ].join("|");
}

/** 同一ブロック内の2件が同一物件らしいか（0〜1）。閾値は運用データでチューニングする */
export function sameUnitLikelihood(a: NormalizedListing, b: NormalizedListing): number {
  if (dedupeBlockKey(a) !== dedupeBlockKey(b)) return 0;
  let score = 0.6;
  const priceDiff = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
  if (priceDiff <= 0.02) score += 0.2;
  else if (priceDiff > 0.1) score -= 0.3;
  if (a.title && b.title && normalizeBuildingName(a.title) === normalizeBuildingName(b.title)) {
    score += 0.2;
  }
  return Math.max(0, Math.min(1, score));
}

function normalizeBuildingName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/\d+号室$/, "")
    .toLowerCase();
}
