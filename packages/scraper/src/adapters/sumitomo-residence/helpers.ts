/**
 * 住友不動産の賃貸サイト用の正規化ヘルパー。
 * いずれも @devote/core に無い変換で、汎用性があるものは core へ移す候補（最終報告参照）。
 */
import { parseMonthsOrYen, parseYen, toHalfWidth } from "@devote/core";

/** "36F" / "B1F" / "36階" → 所在階（地下は負数） */
export function parseFloorLabel(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "").toUpperCase();
  const basement = s.match(/^(?:B|地下)(\d+)(?:F|階)?$/);
  if (basement) return -Number(basement[1]);
  const m = s.match(/^(\d+)(?:F|階)$/);
  return m ? Number(m[1]) : null;
}

/** "鉄骨造　地上43階　地下2階" / "地上23階/地下1階" / "10階建" → 地上階数 */
export function parseTotalFloors(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  const m = s.match(/地上(\d+)階/) ?? s.match(/(\d+)階建/);
  return m ? Number(m[1]) : null;
}

const STRUCTURES: [RegExp, string][] = [
  [/鉄骨鉄筋|SRC/i, "SRC"],
  [/鉄筋コンクリート|RC/i, "RC"],
  [/軽量鉄骨/, "LGS"],
  [/鉄骨|^S造?$/, "S"],
  [/木造/, "W"],
];

/**
 * "鉄骨造、一部鉄筋コンクリート造　地上43階" のように主構造＋一部構造が併記される。
 * 「一部〜」に引っ張られないよう、先頭の区切りまでを主構造として判定する。
 */
export function parseMainStructure(input: string | null | undefined): string | null {
  if (input == null) return null;
  const head =
    toHalfWidth(input)
      .trim()
      .split(/[、,，\s/／]/)[0] ?? "";
  return STRUCTURES.find(([re]) => re.test(head))?.[1] ?? null;
}

/**
 * "敷金3ヶ月/礼金0/共益費15,000円" → { 敷金: "3ヶ月", 礼金: "0", 共益費: "15,000円" }
 * 1行に複数の費目が詰め込まれている表記を分解する。
 */
export function splitFeeLine(input: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const part of input.split(/[/／]/)) {
    const m = part.trim().match(/^(敷金|保証金|礼金|共益費|管理費|管理費・共益費)[:：\s]*(.*)$/);
    if (m?.[1]) out[m[1]] = (m[2] ?? "").trim();
  }
  return out;
}

/** 敷金・礼金: "3ヶ月" / "0" / "なし" / "200,000円" → 円 */
export function parseDepositLike(input: string | null | undefined, rent: number): number | null {
  if (input == null || input.trim() === "") return null;
  return parseMonthsOrYen(input, rent) ?? parseYen(input);
}
