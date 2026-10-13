/**
 * 対象エリア（2026-10 時点の方針）。
 * towns を指定した区は、その町名（丁目違いを含む）のみ対象。
 */
export interface TargetArea {
  prefecture: "東京都";
  city: string;
  towns?: string[];
}

export const TARGET_AREAS: TargetArea[] = [
  { prefecture: "東京都", city: "港区" },
  { prefecture: "東京都", city: "中央区", towns: ["勝どき"] },
  { prefecture: "東京都", city: "渋谷区" },
  { prefecture: "東京都", city: "千代田区" },
  { prefecture: "東京都", city: "品川区" },
  { prefecture: "東京都", city: "江東区", towns: ["豊洲"] },
];

/** 住所文字列が対象エリアか（"東京都中央区勝どき６丁目" / "中央区勝どき" など） */
export function isInTargetArea(address: string): boolean {
  const s = address.normalize("NFKC").replace(/\s+/g, "");
  return TARGET_AREAS.some((a) => {
    const i = s.indexOf(a.city);
    if (i < 0) return false;
    if (!a.towns) return true;
    const rest = s.slice(i + a.city.length);
    return a.towns.some((t) => rest.startsWith(t));
  });
}

/** 住所を { prefecture, city, town } に分解（町名は丁目・番地を除く） */
export function splitAddress(address: string): {
  prefecture: string | null;
  city: string | null;
  town: string | null;
} {
  const s = address.normalize("NFKC").replace(/\s+/g, "");
  const m = s.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])?(.*)$/);
  const town =
    m?.[3]
      ?.replace(/[0-9０-９一二三四五六七八九十]+丁目.*$/, "")
      .replace(/[0-9-]+.*$/, "")
      .trim() || null;
  return { prefecture: m?.[1] ?? null, city: m?.[2] ?? null, town };
}
