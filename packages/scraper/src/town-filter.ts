/**
 * 区単位でしか検索できないサイトで、対象エリアが町名指定の区（中央区勝どき・江東区豊洲）を巡回するときの絞り込み。
 *
 * 対象外の物件は取り込み時に捨てられて listings に残らないため、一覧で落とさないと毎回詳細を取り直すことになる。
 * 一覧URLのフラグメント（`#towns=勝どき`）に町名を載せる。フラグメントはサーバーに送られないので検索結果は変わらず、
 * ランナーは parseList に要求したURLをそのまま渡すので、パーサ側で町名を読める。
 */
const KEY = "towns";

/** 一覧URLに町名の絞り込みを付ける */
export function withTowns(url: string, towns: readonly string[] | undefined): string {
  if (!towns || towns.length === 0) return url;
  const u = new URL(url);
  u.hash = `${KEY}=${towns.map(encodeURIComponent).join(",")}`;
  return u.toString();
}

/** 一覧URLに付いた町名（無ければ null = 絞り込みなし） */
export function townsOf(url: string): string[] | null {
  const hash = new URL(url).hash.replace(/^#/, "");
  const m = hash.match(new RegExp(`(?:^|&)${KEY}=([^&]*)`));
  if (!m?.[1]) return null;
  return m[1].split(",").map(decodeURIComponent).filter(Boolean);
}

/** 住所が町名のいずれかを含むか（"東京都中央区勝どき　６丁目" は「勝どき」に当たる） */
export function addressInTowns(address: string, towns: readonly string[]): boolean {
  const s = address.normalize("NFKC").replace(/\s+/g, "");
  return towns.some((t) => s.includes(t.normalize("NFKC")));
}

/** 次ページURLにも同じ絞り込みを引き継ぐ */
export function carryTowns(next: string | null, current: string): string | null {
  if (!next) return null;
  return withTowns(next, townsOf(current) ?? undefined);
}
