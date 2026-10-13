import { formatYen, type NormalizedListing, SQM_PER_TSUBO, toHalfWidth } from "@devote/core";

/** 新着として扱う時間 */
export const FRESH_HOURS = 72;

/** 初めて確認してからの経過時間（時間、切り捨て）。新着の範囲外なら null */
export function freshHours(firstSeen: Date | string | null | undefined, now = new Date()) {
  if (!firstSeen) return null;
  const t = new Date(firstSeen).getTime();
  if (Number.isNaN(t)) return null;
  const h = Math.floor((now.getTime() - t) / 3_600_000);
  return h >= 0 && h < FRESH_HOURS ? h : null;
}

/**
 * 同じ建物かを見分けるためのキー。建物名の末尾の部屋番号・階（"1203" "1203号室" "12階"）を除き、
 * 全角・空白の揺れをそろえる。取引種別と用途も含める（同じ建物の賃貸と売買は分ける）。
 */
export function buildingKey(
  l: Pick<NormalizedListing, "title" | "dealType" | "usage" | "address">,
): string | null {
  if (!l.title) return null;
  let t = toHalfWidth(l.title).toLowerCase();
  for (;;) {
    const next = t
      .trim()
      .replace(/[\s]*(?:[a-z]?-?\d{2,5}[a-z]?(?:号室|号)?|\d+階|\d+f)$/u, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  t = t.replace(/[\s・()（）]/gu, "");
  if (!t) return null;
  return [l.dealType, l.usage ?? "residential", l.address.city ?? "", t].join("|");
}

/** 管理費込みの総額（賃貸）／価格（売買） */
export const totalPrice = (l: NormalizedListing) =>
  l.price + (l.dealType === "rent" ? (l.managementFee ?? 0) : 0);

/**
 * 並び順を保ったまま、同じ建物の部屋を最初に出てきた1件にまとめる。
 * まとめた側の部屋は others に入る。
 */
export function groupByBuilding<T extends { listing: NormalizedListing }>(items: T[]) {
  const groups: { lead: T; others: T[] }[] = [];
  const byKey = new Map<string, { lead: T; others: T[] }>();
  for (const it of items) {
    const key = buildingKey(it.listing);
    const g = key ? byKey.get(key) : undefined;
    if (g) {
      g.others.push(it);
      continue;
    }
    const ng = { lead: it, others: [] as T[] };
    groups.push(ng);
    if (key) byKey.set(key, ng);
  }
  return groups;
}

/** "45万〜52.5万円" のような総額の幅（同じ値なら1つ） */
export function priceRange(listings: NormalizedListing[]): string {
  const totals = listings.map(totalPrice);
  const lo = Math.min(...totals);
  const hi = Math.max(...totals);
  if (lo === hi) return formatYen(lo);
  return `${formatYen(lo).replace(/円$/, "")}〜${formatYen(hi)}`;
}

/** 面積の表示。事業用は坪を先に「30.2坪（99.8㎡）」 */
export function areaText(l: Pick<NormalizedListing, "areaSqm" | "usage">): string | null {
  if (l.areaSqm == null) return null;
  if (l.usage === "business") {
    const tsubo = Math.round((l.areaSqm / SQM_PER_TSUBO) * 10) / 10;
    return `${tsubo.toFixed(1)}坪（${l.areaSqm}㎡）`;
  }
  return `${l.areaSqm}㎡`;
}
