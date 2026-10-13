import type { NormalizedListing } from "./property";

/**
 * 「この物件がハマるならこれもいい」の類似度（0〜1）。
 * 価格帯・広さ・間取り・生活圏（駅/区）・築年・設備の近さを重み付けして合成する。
 * 管理者の判断データが溜まったら重みを学習で置き換える（similar_suggestions）。
 */
export const SIMILARITY_WEIGHTS = {
  price: 0.3,
  area: 0.2,
  layout: 0.1,
  location: 0.2,
  age: 0.1,
  features: 0.1,
} as const;

function closeness(a: number | null, b: number | null, scale: number): number {
  if (a == null || b == null) return 0.5;
  return Math.max(0, 1 - Math.abs(a - b) / scale);
}

function roomsOf(layout: string | null): number | null {
  const m = layout?.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

export function propertySimilarity(a: NormalizedListing, b: NormalizedListing): number {
  if (a.dealType !== b.dealType) return 0;
  if ((a.usage ?? "residential") !== (b.usage ?? "residential")) return 0;
  const totalA = a.price + (a.dealType === "rent" ? (a.managementFee ?? 0) : 0);
  const totalB = b.price + (b.dealType === "rent" ? (b.managementFee ?? 0) : 0);
  const price = closeness(totalA, totalB, totalA * 0.3);
  const area = closeness(a.areaSqm, b.areaSqm, (a.areaSqm ?? 50) * 0.3);
  const layout =
    a.layout && b.layout && a.layout === b.layout
      ? 1
      : closeness(roomsOf(a.layout), roomsOf(b.layout), 2);

  const stationsA = new Set(a.stations.map((s) => s.station));
  const sharedStation = b.stations.some((s) => stationsA.has(s.station));
  const sameCity = a.address.city != null && a.address.city === b.address.city;
  const location = sharedStation ? 1 : sameCity ? 0.6 : 0.2;

  const yearOf = (l: NormalizedListing) =>
    l.builtYearMonth ? Number(l.builtYearMonth.slice(0, 4)) : null;
  const age = closeness(yearOf(a), yearOf(b), 15);

  const fa = new Set(a.features);
  const union = new Set([...a.features, ...b.features]);
  const features = union.size === 0 ? 0.5 : b.features.filter((f) => fa.has(f)).length / union.size;

  const w = SIMILARITY_WEIGHTS;
  return (
    w.price * price +
    w.area * area +
    w.layout * layout +
    w.location * location +
    w.age * age +
    w.features * features
  );
}
