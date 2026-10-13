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
