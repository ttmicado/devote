/**
 * 森ビル MORI LIVING 固有の正規化ヘルパー（複数棟の建物概要の扱いなど）。
 * 汎用的な変換は @devote/core の normalize を使う。
 */

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
