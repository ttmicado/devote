/**
 * ケン・コーポレーション用の小さな正規化ヘルパー。
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

const TOKYO_23_WARDS =
  "千代田区|中央区|港区|新宿区|文京区|台東区|墨田区|江東区|品川区|目黒区|大田区|世田谷区|渋谷区|中野区|杉並区|豊島区|北区|荒川区|板橋区|練馬区|足立区|葛飾区|江戸川区";

/**
 * 都道府県が省略された住所（"千代田区神田猿楽町２"）に都道府県を補う。
 * 東京23区・横浜市・川崎市だけを補い、判断できなければそのまま返す。
 */
export function withPrefecture(address: string): string {
  const s = address.normalize("NFKC").replace(/\s+/g, "");
  if (/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.test(s)) return s;
  if (new RegExp(`^(${TOKYO_23_WARDS})`).test(s)) return `東京都${s}`;
  if (/^(横浜市|川崎市|相模原市|鎌倉市|藤沢市|逗子市|茅ヶ崎市)/.test(s)) return `神奈川県${s}`;
  if (/^(武蔵野市|三鷹市|調布市|府中市|八王子市|立川市)/.test(s)) return `東京都${s}`;
  return s;
}
