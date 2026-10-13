/**
 * 会社名・建物名の表記揺れを吸収する（同じ業者・同じ建物かの比較用。表示には使わない）。
 */

/** "株式会社 ABC不動産" / "(株)ABC不動産" / "ＡＢＣ不動産㈱" → "abc不動産" */
export function normalizeAgencyName(name: string | null | undefined): string {
  if (!name) return "";
  return (
    name
      .normalize("NFKC") // 全角英数・㈱ → 半角・(株)
      .trim()
      // 空白の後ろの支店・営業所名（"ABC不動産 渋谷店"）は同じ業者として扱う
      .replace(/\s+\S{1,12}(支店|営業所|店|本店|本社)$/, "")
      .replace(
        /株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|\((株|有|同|資|名)\)/g,
        "",
      )
      .replace(/[\s・.,、。'"「」『』]/g, "")
      .toLowerCase()
  );
}

/** 同じ業者か（表記揺れ・支店名の違いを無視） */
export function sameAgency(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeAgencyName(a);
  const y = normalizeAgencyName(b);
  return x !== "" && x === y;
}

/** "パークコート赤坂 檜町ザ タワー 1204号室" → "パークコート赤坂檜町ザタワー" */
export function normalizeBuildingName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[-#]?\d+(号室|号|F|階)?$/i, "")
    .replace(/[・.、'"]/g, "")
    .toLowerCase();
}
