import { buildingAgeYears } from "./normalize";
import type { NormalizedListing } from "./property";

/** 185000 → "18.5万円" / 129800000 → "1億2,980万円" */
export function formatYen(yen: number): string {
  if (yen >= 100_000_000) {
    const oku = Math.floor(yen / 100_000_000);
    const man = Math.round((yen % 100_000_000) / 10_000);
    return man > 0 ? `${oku}億${man.toLocaleString("ja-JP")}万円` : `${oku}億円`;
  }
  if (yen >= 10_000) {
    const man = yen / 10_000;
    return `${Number.isInteger(man) ? man.toLocaleString("ja-JP") : man.toFixed(1).replace(/\.0$/, "")}万円`;
  }
  return `${yen.toLocaleString("ja-JP")}円`;
}

/** 通知・一覧用の1行サマリ: "港区六本木 / 2LDK 70.1㎡ / 六本木駅 徒歩5分" */
export function summarizeListing(l: NormalizedListing): string {
  const area = [l.address.city, l.address.town].filter(Boolean).join("");
  const room = [l.layout, l.areaSqm != null ? `${l.areaSqm}㎡` : null].filter(Boolean).join(" ");
  const st = l.stations[0];
  const access = st
    ? `${st.station}駅 ${st.walkMinutes != null ? `徒歩${st.walkMinutes}分` : st.busMinutes != null ? `バス${st.busMinutes}分` : ""}`.trim()
    : null;
  return [area, room, access].filter(Boolean).join(" / ");
}

/** 賃料は管理費込みの表示、売買は価格 */
export function priceLabel(l: NormalizedListing): string {
  if (l.dealType === "rent") {
    const fee = l.managementFee ? `（管理費${formatYen(l.managementFee)}）` : "";
    return `${formatYen(l.price)}${fee}`;
  }
  return formatYen(l.price);
}

/** 判断に必要な数字: 賃貸は管理費込みの総額（月額）、売買は価格 */
export function headlinePrice(l: NormalizedListing): {
  label: string;
  amount: string;
  note: string | null;
} {
  if (l.dealType === "rent") {
    const total = l.price + (l.managementFee ?? 0);
    const note = l.managementFee
      ? `賃料 ${formatYen(l.price)} ＋ 管理費 ${formatYen(l.managementFee)}`
      : null;
    return { label: "総額／月", amount: formatYen(total), note };
  }
  const perSqm =
    l.areaSqm && l.areaSqm > 0 ? `㎡単価 ${formatYen(Math.round(l.price / l.areaSqm))}` : null;
  return { label: "価格", amount: formatYen(l.price), note: perSqm };
}

/** 経営者が一目で判断するための1行: "南麻布 · 2LDK 68㎡ · 広尾 徒歩6分 · 築8年 · 12階" */
export function keyFacts(l: NormalizedListing, now: Date = new Date()): string[] {
  const st = l.stations[0];
  const access = st
    ? `${st.station} ${st.walkMinutes != null ? `徒歩${st.walkMinutes}分` : st.busMinutes != null ? `バス${st.busMinutes}分` : ""}`.trim()
    : null;
  const age = l.builtYearMonth
    ? (() => {
        const y = buildingAgeYears(l.builtYearMonth, now);
        return y === 0 ? "築1年未満" : `築${y}年`;
      })()
    : null;
  return [
    l.address.town ?? l.address.city,
    [l.layout, l.areaSqm != null ? `${l.areaSqm}㎡` : null].filter(Boolean).join(" ") || null,
    access,
    age,
    l.floor != null ? (l.floor < 0 ? `地下${-l.floor}階` : `${l.floor}階`) : null,
  ].filter((v): v is string => Boolean(v));
}
