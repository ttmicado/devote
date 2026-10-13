/**
 * アクセルホーム用の小さな正規化ヘルパー。
 * core に同等の関数がないため暫定でここに置く（core へ移す候補）。
 */
import { toHalfWidth } from "@devote/core";

/** "地上15階 地下1階 SRC造" / "鉄筋コンクリート造" → "SRC" / "RC" など */
export function parseStructure(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = toHalfWidth(input);
  if (/鉄骨鉄筋|SRC/i.test(s)) return "SRC";
  if (/鉄筋コンクリート|RC|PC造|プレキャスト/i.test(s)) return "RC";
  if (/軽量鉄骨/.test(s)) return "LGS";
  if (/鉄骨|(?:^|[^A-Z])S造/i.test(s)) return "S";
  if (/木造/.test(s)) return "W";
  return null;
}

/**
 * 建物の階数（地上階）だけを取る。
 * "地上32階 地下1階建" / "地上13階建" / "地上3階 地下1階" / "10階建て" → 32 / 13 / 3 / 10
 * core の parseFloor は "地上32階 地下1階建" の「1階建」を総階数と誤認するため別に用意した。
 */
export function parseTotalFloors(input: string | null | undefined): number | null {
  if (!input) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  const above = s.match(/地上(\d+)階/);
  if (above) return Number(above[1]);
  const total = s.replace(/地下\d+階建?/g, "").match(/(\d+)階建/);
  return total ? Number(total[1]) : null;
}

/** "2026年10月13日" / "2026/10/13" → JST 0時の ISO 文字列 */
export function parseJpDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = toHalfWidth(input).match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]?.padStart(2, "0")}-${m[3]?.padStart(2, "0")}T00:00:00+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
