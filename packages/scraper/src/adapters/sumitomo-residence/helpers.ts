/**
 * 住友不動産の賃貸サイト固有の正規化ヘルパー（費目の詰め込み表記など）。
 * 汎用的な変換は @devote/core の normalize を使う。
 */
import { parseMonthsOrYen, parseYen } from "@devote/core";

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
