/**
 * 森ビル MORI LIVING 用の正規化ヘルパー。
 * いずれも @devote/core に無い変換で、汎用性があるものは core へ移す候補（最終報告参照）。
 */
import { parseLayout, parseYen, toHalfWidth } from "@devote/core";

/** "¥510,000" / "￥1,200,000" / "51万円" → 円。"お問い合わせ" などは null */
export function parseYenWithSymbol(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input)
    .replace(/[¥￥]/g, "")
    .replace(/\(税込\)|（税込）|\/月|／月/g, "");
  return parseYen(s);
}

/**
 * 英語圏の間取り表記。"1BR" → "1LDK"、"3BR+F"（ファミリールーム付き）→ "3LDK"、"STUDIO" → "1R"。
 * 日本式の表記（"2LDK" など）は parseLayout にそのまま渡す。
 * BR（ベッドルーム）+ リビング・ダイニング・キッチンが前提の高級賃貸で使われるため nBR = nLDK とみなす。
 */
export function parseLayoutLoose(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "").toUpperCase();
  if (/^STUDIO$/.test(s)) return "1R";
  const br = s.match(/^(\d+)(?:BR|BED(?:ROOMS?)?)(\+S)?/);
  if (br) return `${br[1]}${br[2] ? "SLDK" : "LDK"}`;
  return parseLayout(s);
}

/**
 * 敷金・礼金の自由記述。"原則賃料の4ヶ月分" / "賃料の2ヵ月" / "なし" / "1,000,000円" → 円
 */
export function parseMonthsLoose(input: string | null | undefined, rent: number): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  if (s === "") return null;
  if (/^(なし|無し|無|-|ー|0|0円|賃料込み?)$/.test(s)) return 0;
  const months = s.match(/(\d+(?:\.\d+)?)(?:ヶ|ケ|ヵ|カ|か|箇)?月/);
  if (months) return Math.round(Number(months[1]) * rent);
  const yen = s.match(/[¥￥]?([\d,]+(?:\.\d+)?万?[\d,]*)円?/);
  return yen ? parseYenWithSymbol(yen[0]) : null;
}

/** 管理費・共益費: "賃料込み" → 0、"20,000円" → 20000 */
export function parseFeeLoose(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  if (/込/.test(s) || /^(なし|無し|-)$/.test(s)) return 0;
  return parseYenWithSymbol(s);
}

/**
 * 複数棟の建物概要「レジデンスA／RC造\nレジデンスB／SRC造…」から、対象棟の行を選ぶ。
 * 棟名の接頭辞がない（1行だけ）のときはそのまま返す。対象棟が特定できなければ null。
 */
export function pickBuildingLine(text: string | null | undefined, title: string): string | null {
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const labeled = lines
    .map((l) => l.match(/^(.+?)[／/](.+)$/))
    .filter((m): m is RegExpMatchArray => m != null);
  if (labeled.length < 2) return lines.join(" ");
  const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
  const t = norm(title);
  const hit = labeled.find((m) =>
    norm(m[1] ?? "")
      .split(/[・、,]/)
      .some((label) => label !== "" && t.endsWith(label)),
  );
  return hit?.[2]?.trim() ?? null;
}

/** "地上43階・地下2階" / "43階建" → 43 */
export function parseTotalFloors(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  const m = s.match(/地上(\d+)階/) ?? s.match(/(\d+)階建/) ?? s.match(/^(\d+)階$/);
  return m ? Number(m[1]) : null;
}

const STRUCTURES: [RegExp, string][] = [
  [/鉄骨鉄筋|SRC/i, "SRC"],
  [/鉄筋コンクリート|RC/i, "RC"],
  [/軽量鉄骨/, "LGS"],
  [/鉄骨|^S造?/, "S"],
  [/木造/, "W"],
];

/** "SRC造（CFT柱）、SRC造・RC造（地下）" → "SRC"（先頭の主構造で判定） */
export function parseMainStructure(input: string | null | undefined): string | null {
  if (input == null) return null;
  const head =
    toHalfWidth(input)
      .trim()
      .split(/[、,\s（(]/)[0] ?? "";
  return STRUCTURES.find(([re]) => re.test(head))?.[1] ?? null;
}

/** "南向き" / "向き：南東" などから方位 */
export function findDirection(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(南東|南西|北東|北西|東|西|南|北)向き/);
  return m?.[1] ?? null;
}
