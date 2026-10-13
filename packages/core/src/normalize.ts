/**
 * 不動産サイトの表記揺れを正規化するユーティリティ。
 * アダプターはここを通してから NormalizedListing を組み立てる。
 */

/** 全角英数記号・全角スペースを半角に寄せる */
export function toHalfWidth(input: string): string {
  return input
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/[−ー―‐]/g, (c, offset: number, s: string) =>
      // 数字に挟まれた長音・ダッシュはハイフン扱い（例: 1−2−3）
      /\d/.test(s[offset - 1] ?? "") && /\d/.test(s[offset + 1] ?? "") ? "-" : c,
    );
}

function clean(input: string): string {
  return toHalfWidth(input).replace(/,/g, "").replace(/\s+/g, "").trim();
}

const EMPTY_MARKERS = /^(-|－|なし|無|無し|0|0円|ー|—)$/;

/**
 * 金額表記を円に変換。
 * "8.5万円" → 85000, "1億2,000万円" → 120000000, "85,000円" → 85000, "なし" → 0
 * 解釈できなければ null。
 */
export function parseYen(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = clean(input).replace(/^(月額|税込|価格)/, "");
  if (s === "") return null;
  if (EMPTY_MARKERS.test(s)) return 0;
  const m = s.match(/^(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)万)?(\d+)?円?$/);
  if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
  const oku = m[1] ? Number(m[1]) * 100_000_000 : 0;
  const man = m[2] ? Number(m[2]) * 10_000 : 0;
  const yen = m[3] ? Number(m[3]) : 0;
  return Math.round(oku + man + yen);
}

/**
 * 敷金・礼金など「1ヶ月」「1.5ヵ月」表記を円に変換（賃料基準）。円表記もそのまま受け付ける。
 */
export function parseMonthsOrYen(input: string | null | undefined, rentYen: number): number | null {
  if (input == null) return null;
  const s = clean(input);
  const months = s.match(/^(\d+(?:\.\d+)?)(?:ヶ|ケ|ヵ|カ|か)?月$/);
  if (months) return Math.round(Number(months[1]) * rentYen);
  return parseYen(s);
}

/** "25.5㎡" / "25.5m2" / "25.5m²" / "25.5平米" → 25.5 */
export function parseAreaSqm(input: string | null | undefined): number | null {
  if (input == null) return null;
  const m = clean(input).match(/(\d+(?:\.\d+)?)(?:㎡|m2|m²|平米|平方メートル)/i);
  return m ? Number(m[1]) : null;
}

/** 1坪あたりの㎡（計量法上の定義 400/121 ㎡ の近似。業界の慣用値） */
export const SQM_PER_TSUBO = 3.30579;

/** "27.48坪" / "２７．４８ 坪" → 27.48。坪表記がなければ null */
export function parseTsubo(input: string | null | undefined): number | null {
  if (input == null) return null;
  const m = clean(input).match(/(\d+(?:\.\d+)?)坪/);
  return m ? Number(m[1]) : null;
}

/** 坪 → ㎡（小数第2位で四捨五入） */
export function tsuboToSqm(tsubo: number): number {
  return Math.round(tsubo * SQM_PER_TSUBO * 100) / 100;
}

/**
 * 事業用物件の面積表記を㎡に。㎡の併記があればそれを優先し（サイトの実測値どおり）、
 * 坪だけなら換算する。"27.48坪 (90.84㎡)" → 90.84、"30.3坪" → 100.16
 */
export function parseAreaSqmOrTsubo(input: string | null | undefined): number | null {
  const sqm = parseAreaSqm(input);
  if (sqm != null) return sqm;
  const tsubo = parseTsubo(input);
  return tsubo != null && tsubo > 0 ? tsuboToSqm(tsubo) : null;
}

/** "１ＬＤＫ" / "1sldk" / "ワンルーム" → "1LDK" / "1SLDK" / "1R" */
export function parseLayout(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = clean(input).toUpperCase();
  if (/ワンルーム|^1R$/.test(s)) return "1R";
  const m = s.match(/(\d+)\s*(S?L?D?K|R)(\+S)?/);
  if (!m) return null;
  // "2LDK+S" は納戸付き → "2SLDK" に寄せる
  const body = m[3] && !m[2]?.startsWith("S") ? `S${m[2]}` : m[2];
  return `${m[1]}${body}`;
}

/** "徒歩5分" / "歩5分" → 5。"バス10分 停歩3分" のようなバス便は徒歩部分だけ見ない（parseStationAccess 参照） */
export function parseWalkMinutes(input: string | null | undefined): number | null {
  if (input == null) return null;
  const m = clean(input).match(/(?:徒歩|歩)(\d+)分/);
  return m ? Number(m[1]) : null;
}

/** 道のり距離(m)から徒歩分数を算出（不動産公正競争規約: 80m=1分、端数切り上げ） */
export function walkMinutesFromMeters(meters: number): number {
  return Math.ceil(meters / 80);
}

/**
 * "東急東横線「中目黒」駅 徒歩5分" / "JR山手線/渋谷駅 歩7分" / "京王線 調布駅 バス10分 停歩3分"
 */
export function parseStationAccess(input: string): {
  line: string | null;
  station: string;
  walkMinutes: number | null;
  busMinutes: number | null;
} | null {
  const s = toHalfWidth(input).replace(/\s+/g, " ").trim();
  const m = s.match(/^(?:(.+?)[\s/／]*)?[「『]?([^「」『』\s/／]+?)[」』]?駅/);
  if (!m?.[2]) return null;
  const bus = s.match(/バス(\d+)分/);
  const walkAfterBus = bus ? s.match(/停歩(\d+)分/) : null;
  const line = m[1]?.replace(/[「『\s/／]+$/, "").trim() || null;
  return {
    line,
    station: m[2],
    walkMinutes: bus ? (walkAfterBus ? Number(walkAfterBus[1]) : null) : parseWalkMinutes(s),
    busMinutes: bus ? Number(bus[1]) : null,
  };
}

const ERA_OFFSETS: Record<string, number> = {
  明治: 1867,
  大正: 1911,
  昭和: 1925,
  平成: 1988,
  令和: 2018,
  M: 1867,
  T: 1911,
  S: 1925,
  H: 1988,
  R: 2018,
};

/**
 * 築年月を "YYYY-MM" に。月不明は "-01" とせず null 扱いにはしない（"YYYY-01" に寄せる）。
 * "2015年3月" / "2015/03" / "平成27年3月" / "H27.3" / "令和元年築"
 */
export function parseBuiltYearMonth(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = clean(input).replace(/元年/, "1年");
  let year: number | null = null;
  let month = 1;

  const era = s.match(/^(明治|大正|昭和|平成|令和|[MTSHR])(\d{1,2})[年.](?:(\d{1,2})月?)?/);
  const western = s.match(/^(\d{4})[年/.-](?:(\d{1,2})月?)?/) ?? s.match(/^(\d{4})年?/);
  if (era?.[1] && era[2]) {
    const offset = ERA_OFFSETS[era[1]];
    if (offset == null) return null;
    year = offset + Number(era[2]);
    if (era[3]) month = Number(era[3]);
  } else if (western?.[1]) {
    year = Number(western[1]);
    if (western[2]) month = Number(western[2]);
  }
  if (year == null || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "3階/10階建" / "地下1階" / "10階建の3階" → { floor, totalFloors } */
export function parseFloor(input: string | null | undefined): {
  floor: number | null;
  totalFloors: number | null;
} {
  if (input == null) return { floor: null, totalFloors: null };
  const s = clean(input);
  // 総階数は「地上N階」を優先（「地上32階地下1階建」の「1階建」を総階数と誤認しない）
  const total = s.match(/地上(\d+)階/)?.[1] ?? s.match(/(?<!地下)(\d+)階建/)?.[1];
  const rest = s
    .replace(/地上\d+階(建)?/g, "")
    .replace(/地下\d+階建/g, "")
    .replace(/\d+階建/g, "");
  const basement = rest.match(/地下(\d+)階/);
  const above = rest.match(/(\d+)階/);
  let floor: number | null = null;
  if (basement) floor = -Number(basement[1]);
  else if (above) floor = Number(above[1]);
  return { floor, totalFloors: total ? Number(total) : null };
}

/** 築年数（基準日時点、満年数） */
export function buildingAgeYears(builtYearMonth: string, now: Date = new Date()): number {
  const [y, m] = builtYearMonth.split("-").map(Number) as [number, number];
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.max(0, Math.floor(months / 12));
}
