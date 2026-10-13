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

/**
 * 入居可能時期を正規化する。
 * - "即入居可" "即日" "即" → "即入居可"
 * - "相談" "要相談" → "相談"
 * - "2026年11月下旬" "空室予定（退去予定：2026年11月）" "令和8年11月" → "2026-11"
 * - 年のない "11月中旬" は基準日から見て次に来るその月（過ぎていれば翌年）
 * - それ以外は表記どおり（長すぎる場合は切り詰める）。空なら null
 */
export function parseAvailableFrom(
  input: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (input == null) return null;
  const s = clean(input);
  if (s === "" || /^(-|－|ー|—)$/.test(s)) return null;
  const ym = s.match(/(\d{4})[年/.-](\d{1,2})月?/);
  if (ym?.[1] && ym[2]) {
    const m = Number(ym[2]);
    if (m >= 1 && m <= 12) return `${ym[1]}-${String(m).padStart(2, "0")}`;
  }
  const era = s.match(/(平成|令和|[HR])(\d{1,2}|元)年(\d{1,2})月/);
  if (era?.[1] && era[2] && era[3]) {
    const built = parseBuiltYearMonth(`${era[1]}${era[2]}年${era[3]}月`);
    if (built) return built;
  }
  if (/即/.test(s)) return "即入居可";
  const monthOnly = s.match(/^(?:入居)?(\d{1,2})月(上旬|中旬|下旬|頃|予定)?/);
  if (monthOnly?.[1]) {
    const m = Number(monthOnly[1]);
    if (m >= 1 && m <= 12) {
      const jst = new Date(now.getTime() + 9 * 3600_000);
      const y = jst.getUTCFullYear() + (m < jst.getUTCMonth() + 1 ? 1 : 0);
      return `${y}-${String(m).padStart(2, "0")}`;
    }
  }
  if (/相談/.test(s)) return "相談";
  const raw = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}

/**
 * 契約形態と契約期間（賃貸のみ。売買の「定借」は定期借地権のことなので使わない）。
 * "定期借家契約（2年）" → { contractType: "fixed_term", termMonths: 24 }
 * "普通借家契約" → { contractType: "normal", termMonths: null }
 * "2年" → { contractType: null, termMonths: 24 }
 */
export function parseContractType(input: string | null | undefined): {
  contractType: "normal" | "fixed_term" | null;
  termMonths: number | null;
} {
  if (input == null) return { contractType: null, termMonths: null };
  const s = clean(input);
  const contractType = /定期借家|定借|定期建物賃貸借/.test(s)
    ? "fixed_term"
    : /普通(借家|建物賃貸借|賃貸借)/.test(s)
      ? "normal"
      : null;
  let termMonths: number | null = null;
  // 「2028年3月まで」のような日付は期間として扱わない
  const years = s.match(/(?<![\d.])(\d{1,2}(?:\.\d+)?)年(?!\d|\d{0,2}月)/);
  const months = s.match(/(?<![\d年])(\d{1,3})(?:ヶ|ケ|ヵ|カ|か|ヶ)?月(?!\d*日)/);
  if (years?.[1] && Number(years[1]) > 0 && Number(years[1]) <= 50) {
    termMonths = Math.round(Number(years[1]) * 12);
  } else if (months?.[1] && Number(months[1]) > 0 && /(ヶ|ケ|ヵ|カ|か)月/.test(s)) {
    termMonths = Number(months[1]);
  }
  return { contractType, termMonths };
}

/** 構造の判定表（上から順に評価。"SRC" は "RC" を含むので先に見る） */
const STRUCTURES: [RegExp, string][] = [
  [/鉄骨鉄筋|SRC/, "SRC"],
  [/鉄筋コンクリート|RC|PC造|プレキャスト/, "RC"],
  [/軽量鉄骨/, "LGS"],
  [/鉄骨|^S造?$/, "S"],
  [/木造/, "W"],
];

/**
 * 構造を "SRC" / "RC" / "LGS" / "S" / "W" に。判定できなければ null。
 * "鉄骨造、一部鉄筋コンクリート造　地上43階" のように主構造＋一部構造が併記されるので、
 * 区切りごとに前から見て最初に構造と分かった語（＝主構造）を採る。「一部〜」は主構造にしない。
 * "地上15階 地下1階 SRC造" のように階数が先に来る表記も受け付ける。
 */
export function parseStructure(input: string | null | undefined): string | null {
  if (input == null) return null;
  const tokens = toHalfWidth(input)
    .toUpperCase()
    .split(/[、,，\s/／（）()・]+/)
    .filter((t) => t !== "" && !t.startsWith("一部"));
  for (const token of tokens) {
    const hit = STRUCTURES.find(([re]) => re.test(token));
    if (hit) return hit[1];
  }
  return null;
}

/**
 * 建物の地上階数だけを取る。"地上32階 地下1階建" / "鉄骨造　地上43階　地下2階" / "１０階建て" → 32 / 43 / 10
 * 所在階しか書かれていない "3階" は総階数とみなさない（null）。
 */
export function parseTotalFloors(input: string | null | undefined): number | null {
  return parseFloor(input).totalFloors;
}

/** "36F" / "B1F" / "地下1階" / "36階" → 所在階（地下は負数）。階の表記だけの文字列に使う */
export function parseFloorLabel(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = clean(input).toUpperCase();
  const basement = s.match(/^(?:B|地下)(\d+)(?:F|階)?$/);
  if (basement) return -Number(basement[1]);
  const m = s.match(/^(\d+)(?:F|階)$/);
  return m ? Number(m[1]) : null;
}

/**
 * "2026年10月13日" / "2026/10/13" / "最終更新日: 2026.10.3" → JST 0時の ISO 文字列（UTC表記）。
 * 存在しない日付（2月30日など）は null。
 */
export function parseJpDate(input: string | null | undefined): string | null {
  if (input == null) return null;
  const m = toHalfWidth(input).match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) {
    return null;
  }
  return new Date(utc.getTime() - 9 * 3600_000).toISOString();
}

const TOKYO_23_WARDS =
  "千代田区|中央区|港区|新宿区|文京区|台東区|墨田区|江東区|品川区|目黒区|大田区|世田谷区|渋谷区|中野区|杉並区|豊島区|北区|荒川区|板橋区|練馬区|足立区|葛飾区|江戸川区";

/**
 * 都道府県が省略された住所（"千代田区神田猿楽町２"）に都道府県を補う。
 * 東京23区と一部の市（東京都下・神奈川県）だけを補い、判断できなければそのまま返す。
 */
export function withPrefecture(address: string): string {
  const s = address.normalize("NFKC").replace(/\s+/g, "");
  if (/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.test(s)) return s;
  if (new RegExp(`^(${TOKYO_23_WARDS})`).test(s)) return `東京都${s}`;
  if (/^(武蔵野市|三鷹市|調布市|府中市|八王子市|立川市)/.test(s)) return `東京都${s}`;
  if (/^(横浜市|川崎市|相模原市|鎌倉市|藤沢市|逗子市|茅ヶ崎市)/.test(s)) return `神奈川県${s}`;
  return s;
}

/** "¥510,000" / "￥1,200,000（税込）" / "51万円" → 円。"お問い合わせ" などは null */
export function parseYenWithSymbol(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input)
    .replace(/[¥￥]/g, "")
    .replace(/\(税込\)|\/月/g, "");
  return parseYen(s);
}

/**
 * 敷金・礼金の自由記述。"原則賃料の4ヶ月分" / "賃料の2ヵ月" / "なし" / "1,000,000円" → 円（賃料基準）
 */
export function parseMonthsLoose(input: string | null | undefined, rentYen: number): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  if (s === "") return null;
  if (/^(なし|無し|無|-|ー|0|0円|賃料込み?)$/.test(s)) return 0;
  const months = s.match(/(\d+(?:\.\d+)?)(?:ヶ|ケ|ヵ|カ|か|箇)?月/);
  if (months) return Math.round(Number(months[1]) * rentYen);
  const yen = s.match(/[¥￥]?([\d,]+(?:\.\d+)?万?[\d,]*)円?/);
  return yen ? parseYenWithSymbol(yen[0]) : null;
}

/** 管理費・共益費・修繕積立金: "賃料込み" / "なし" → 0、"20,000円" / "¥20,000" → 20000 */
export function parseFeeLoose(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "");
  if (/込/.test(s) || /^(なし|無し|-)$/.test(s)) return 0;
  return parseYenWithSymbol(s);
}

/**
 * 英語圏の間取り表記も受け付ける parseLayout。"1BR" → "1LDK"、"3BR+S" → "3SLDK"、"STUDIO" → "1R"。
 * BR（ベッドルーム）+ リビング・ダイニング・キッチンが前提の高級賃貸で使われるため nBR = nLDK とみなす。
 * 日本式の表記（"2LDK" など）は parseLayout にそのまま渡す。
 */
export function parseLayoutLoose(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = toHalfWidth(input).replace(/\s+/g, "").toUpperCase();
  if (/^STUDIO$/.test(s)) return "1R";
  const br = s.match(/^(\d+)(?:BR|BED(?:ROOMS?)?)(\+S)?/);
  if (br) return `${br[1]}${br[2] ? "SLDK" : "LDK"}`;
  return parseLayout(s);
}

/** "南向き" / "バルコニー：南東向き" などの文中から主採光の方位 */
export function findDirection(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(南東|南西|北東|北西|東|西|南|北)向き/);
  return m?.[1] ?? null;
}
