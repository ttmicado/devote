/**
 * 設備・条件の自由記述をタグに正規化する辞書。
 * サイトごとの言い回しの違いはここに集約し、マッチング・類似度計算はタグで行う。
 * 新しい表記を見つけたら patterns に追加し、features.test.ts にも例を足す。
 *
 * - タグID は DB に保存した条件（requiredFeatures / soft）や物件データで使っているため、既存のIDは変えない
 * - deny（否定表現）を先に判定し、当たったタグは付けない（例:「二人入居不可」で two_person_ok を付けない）
 * - 「相談」は「可」と分けて *_negotiable タグにする。条件側で「可」を求めたときは、
 *   要相談でも減点して残す（matching.ts の NEGOTIABLE_OF を参照）
 */
export type FeatureCategory = "residential" | "business" | "common";

export interface FeatureDef {
  label: string;
  category: FeatureCategory;
  patterns: RegExp[];
  /** 否定表現。どれかに当たれば patterns に当たってもタグを付けない */
  deny?: RegExp[];
  /** このタグが「要相談」版のとき、対応する「可」のタグ */
  negotiableOf?: string;
}

/** 「不可」系の言い回し */
const NG = "(?:不可|NG|×|禁止|お断り|できません)";
/** 「可」系の言い回し（「可否」の「可」は除く） */
const OK = "(?:可(?!否|能性)|OK|〇|○|歓迎)";

const re = (s: string, flags = "") => new RegExp(s, flags);

export const FEATURE_DICTIONARY: Record<string, FeatureDef> = {
  /* ───────── 共通（住まい・事業用のどちらにも出る設備） ───────── */
  auto_lock: { label: "オートロック", category: "common", patterns: [/オートロック/] },
  delivery_box: {
    label: "宅配ボックス",
    category: "common",
    patterns: [/宅配(ボックス|BOX|ロッカー)/i],
  },
  free_internet: {
    label: "インターネット無料",
    category: "common",
    patterns: [/(ネット|インターネット|Wi-?Fi)(使用料|利用料)?(無料|込み)/i],
  },
  air_conditioner: { label: "エアコン", category: "common", patterns: [/エアコン|冷暖房/] },
  designers: { label: "デザイナーズ", category: "common", patterns: [/デザイナーズ/] },
  renovated: { label: "リノベーション", category: "common", patterns: [/リノベ/] },
  corner_room: { label: "角部屋", category: "common", patterns: [/角部屋|角住戸|角区画/] },
  free_rent: { label: "フリーレント", category: "common", patterns: [/フリーレント/] },
  south_facing: { label: "南向き", category: "common", patterns: [] }, // 向き（directionFeatures）から付ける
  security_company: {
    label: "警備会社のセキュリティ",
    category: "common",
    patterns: [/セコム|SECOM|ALSOK|アルソック|綜合警備|警備会社|(ホーム)?セキュリティ会社/i],
  },
  seismic: {
    label: "免震・制震構造",
    category: "common",
    patterns: [/免震|制震|制振/],
  },
  parking: {
    label: "駐車場あり",
    category: "common",
    patterns: [
      /駐車場[\s:：]*(あり|有り?|付き?|空(き)?(あり|有))/,
      /(敷地内|専用|機械式|平置き?)駐車場/,
      /駐車場\s*\d+台/,
    ],
    deny: [/駐車場[\s:：]*(なし|無し?|空(き)?(なし|無し?)|満車|-$)/],
  },
  parking_flat: {
    label: "平置き駐車場",
    category: "common",
    patterns: [/平置き?(駐車|式|スペース)?/],
  },
  ev_charger: {
    label: "EV充電設備",
    category: "common",
    patterns: [/EV(用)?(充電|コンセント)|電気自動車.{0,6}充電|充電(設備|器|スタンド)/i],
  },
  fixed_term: {
    label: "定期借家",
    category: "common",
    patterns: [/定期借家|定借|定期建物賃貸借/],
    deny: [/定期借家(契約)?[\s:：]*(なし|無し?|ではない)/],
  },
  corporate_only: {
    label: "法人契約限定",
    category: "common",
    patterns: [/法人(契約)?(限定|のみ|専用)|個人(契約)?(不可|NG)/],
  },
  individual_only: {
    label: "個人契約限定",
    category: "common",
    patterns: [/個人(契約)?(限定|のみ)|法人(契約)?(不可|NG)/],
  },

  /* ───────── 住まい ───────── */
  separate_bath_toilet: {
    label: "バス・トイレ別",
    category: "residential",
    patterns: [/バス.?トイレ別|BT別/],
  },
  independent_washbasin: {
    label: "独立洗面台",
    category: "residential",
    patterns: [/独立洗面|洗面所独立/],
  },
  indoor_laundry: {
    label: "室内洗濯機置場",
    category: "residential",
    patterns: [/室内洗濯(機)?置/],
  },
  reheating_bath: { label: "追い焚き", category: "residential", patterns: [/追(い)?焚/] },
  bathroom_dryer: {
    label: "浴室乾燥機",
    category: "residential",
    patterns: [/浴室(換気)?(暖房)?乾燥/],
  },
  system_kitchen: {
    label: "システムキッチン",
    category: "residential",
    patterns: [/システムキッチン/],
  },
  two_burner_stove: {
    label: "2口以上コンロ",
    category: "residential",
    patterns: [/[2-4二三四]口(以上)?(コンロ|ガス|IH)/],
  },
  pet_ok: {
    label: "ペット可",
    category: "residential",
    patterns: [
      re(`ペット(飼育|共生)?(\\([^)]*\\))?${OK}`),
      re(`(小型犬|中型犬|大型犬|犬|猫)(・(小型犬|中型犬|大型犬|犬|猫))*(飼育)?${OK}`),
      /ペット共生/,
    ],
    deny: [re(`ペット(飼育)?[\\s:：]*${NG}`)],
  },
  pet_negotiable: {
    label: "ペット要相談",
    category: "residential",
    negotiableOf: "pet_ok",
    patterns: [/(ペット|小型犬|中型犬|大型犬|犬|猫)(飼育)?(\([^)]*\))?(要)?相談/],
    deny: [re(`ペット(飼育)?[\\s:：]*${NG}`)],
  },
  large_dog_ok: {
    label: "大型犬可",
    category: "residential",
    patterns: [re(`大型犬(飼育)?${OK}`)],
    deny: [re(`大型犬(飼育)?${NG}`)],
  },
  instrument_ok: {
    label: "楽器可",
    category: "residential",
    patterns: [re(`(楽器|ピアノ)(演奏)?${OK}`)],
    deny: [re(`楽器(演奏)?[\\s:：]*${NG}`)],
  },
  instrument_negotiable: {
    label: "楽器要相談",
    category: "residential",
    negotiableOf: "instrument_ok",
    patterns: [/(楽器|ピアノ)(演奏)?(要)?相談/],
    deny: [re(`楽器(演奏)?[\\s:：]*${NG}`)],
  },
  office_ok: {
    label: "事務所利用可",
    category: "residential",
    patterns: [re(`(事務所|SOHO)(利用|使用)?${OK}`, "i")],
    deny: [re(`(住居兼)?(事務所|SOHO)(利用|使用)?[\\s:：]*${NG}`, "i")],
  },
  office_negotiable: {
    label: "事務所利用要相談",
    category: "residential",
    negotiableOf: "office_ok",
    patterns: [/(事務所|SOHO)(利用|使用)?(要)?相談/i],
    deny: [re(`(住居兼)?(事務所|SOHO)(利用|使用)?[\\s:：]*${NG}`, "i")],
  },
  two_person_ok: {
    label: "二人入居可",
    category: "residential",
    patterns: [re(`(二人|2人|ふたり)入居(${OK})?(?!(要)?相談|${NG})`)],
    deny: [re(`(二人|2人|ふたり)入居[\\s:：]*${NG}`)],
  },
  two_person_negotiable: {
    label: "二人入居要相談",
    category: "residential",
    negotiableOf: "two_person_ok",
    patterns: [/(二人|2人|ふたり)入居(要)?相談/],
  },
  concierge: { label: "コンシェルジュ", category: "residential", patterns: [/コンシェルジュ/] },
  staffed_24h: {
    label: "24時間有人管理",
    category: "residential",
    patterns: [/24時間(有人|常駐|管理|警備|セキュリティ|フロント)|有人管理[(（]?24時間/],
  },
  manager_resident: {
    label: "管理人常駐",
    category: "residential",
    patterns: [/管理(人|員)(常駐|日勤|住込|住み込み|駐在)|常駐管理/],
  },
  inner_corridor: { label: "内廊下", category: "residential", patterns: [/内廊下/] },
  disposer: { label: "ディスポーザー", category: "residential", patterns: [/ディスポーザ/] },
  floor_heating: { label: "床暖房", category: "residential", patterns: [/床暖房/] },
  dishwasher: {
    label: "食器洗浄乾燥機",
    category: "residential",
    patterns: [/食器?洗(い|浄)?(乾燥)?機|食洗機?/],
  },
  walk_in_closet: {
    label: "ウォークインクローゼット",
    category: "residential",
    patterns: [/ウォーク(イン|スルー)|WIC|WTC/i],
  },
  gym: {
    label: "フィットネスジム",
    category: "residential",
    patterns: [/フィットネス|トレーニングルーム|ジム(?!ニー)/],
  },
  lounge: {
    label: "ラウンジ",
    category: "residential",
    patterns: [/ラウンジ|パーティー?ルーム|スカイデッキ/],
  },
  guest_room: {
    label: "ゲストルーム",
    category: "residential",
    patterns: [/ゲスト(ルーム|スイート)/],
  },
  garbage_24h: {
    label: "24時間ゴミ出し可",
    category: "residential",
    patterns: [/24時間(ゴミ|ごみ|ゴミ出し|ごみ出し)|(ゴミ|ごみ)(出し)?.{0,4}24時間/],
  },
  view: {
    label: "眺望良好",
    category: "residential",
    patterns: [
      /眺望|眺め(良|が良)|夜景|(リバー|オーシャン|ベイ|シティ|タワー)ビュー|(東京タワー|スカイツリー|レインボーブリッジ|富士山)(を)?(望|一望|が見え)/,
    ],
    deny: [/眺望[\s:：]*(なし|無し?|不良)/],
  },
  roof_balcony: {
    label: "ルーフバルコニー",
    category: "residential",
    patterns: [/ルーフ(バルコニー|テラス)|屋上テラス|ルーバル/],
  },
  top_floor: { label: "最上階", category: "residential", patterns: [/最上階/] },
  furnished: {
    label: "家具付き",
    category: "residential",
    patterns: [/家具(・?家電)?付|家具家電付|ファーニッシュ|サービスアパートメント/],
  },
  condo_for_rent: {
    label: "分譲賃貸",
    category: "residential",
    patterns: [/分譲(賃貸|貸|タイプ|仕様|マンション)/],
  },
  corp_registration_ok: {
    label: "法人登記可",
    category: "residential",
    patterns: [re(`法人登記${OK}`)],
    deny: [re(`法人登記[\\s:：]*${NG}`)],
  },

  /* ───────── 事業用（オフィス・店舗） ───────── */
  skeleton: { label: "スケルトン", category: "business", patterns: [/スケルトン/] },
  inukuki: { label: "居抜き", category: "business", patterns: [/居抜/] },
  food_ok: {
    label: "飲食可",
    category: "business",
    patterns: [re(`(軽|重)?飲食(店)?(利用|使用)?${OK}`)],
    deny: [re(`(?<![軽重])飲食(店)?(利用|使用)?[\\s:：]*${NG}`)],
  },
  food_negotiable: {
    label: "飲食要相談",
    category: "business",
    negotiableOf: "food_ok",
    patterns: [/(軽|重)?飲食(店)?(利用|使用)?(要)?相談/],
    deny: [re(`(?<![軽重])飲食(店)?(利用|使用)?[\\s:：]*${NG}`)],
  },
  heavy_food_ok: {
    label: "重飲食可",
    category: "business",
    patterns: [re(`重飲食${OK}`)],
    deny: [re(`重飲食[\\s:：]*${NG}`)],
  },
  oa_floor: {
    label: "OAフロア",
    category: "business",
    patterns: [/OA(フロア|床)|フリーアクセス(フロア)?/i],
  },
  individual_ac: {
    label: "個別空調",
    category: "business",
    patterns: [/個別(空調|エアコン|冷暖房)/],
  },
  access_24h: {
    label: "24時間利用可",
    category: "business",
    patterns: [/24時間(利用|使用|入退(館|室)|入館|出入り?|稼働)(可|OK)?/],
  },
  signage_ok: {
    label: "看板設置可",
    category: "business",
    patterns: [re(`(看板|サイン)(設置|掲出)?(${OK}|(要)?相談)`)],
    deny: [re(`(看板|サイン)(設置|掲出)?[\\s:：]*${NG}`)],
  },
  street_level: {
    label: "路面",
    category: "business",
    patterns: [/路面(店|店舗|区画)?/],
  },
  divisible: {
    label: "分割可",
    category: "business",
    patterns: [/分割(貸し?|賃貸)?(可|相談|OK)/],
  },
  separate_restroom: {
    label: "男女別トイレ",
    category: "business",
    patterns: [/男女別|トイレ.?男女(別|区分)/],
  },
};

export const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  residential: "住まい",
  business: "事業用",
  common: "共通",
};

/** 要相談タグ → 対応する「可」タグ（pet_negotiable → pet_ok） */
export const NEGOTIABLE_OF: Record<string, string> = Object.fromEntries(
  Object.entries(FEATURE_DICTIONARY)
    .filter(([, d]) => d.negotiableOf)
    .map(([tag, d]) => [tag, d.negotiableOf as string]),
);

/** 「可」タグ → その要相談タグ（pet_ok → pet_negotiable） */
export function negotiableVariant(tag: string): string | null {
  return Object.entries(NEGOTIABLE_OF).find(([, ok]) => ok === tag)?.[0] ?? null;
}

/** 表示用ラベル。辞書にないIDはそのまま返す（ユーザー向けには使わないこと） */
export function featureLabel(tag: string): string {
  return FEATURE_DICTIONARY[tag]?.label ?? tag;
}

/** 「ペット可」→「ペット」。要相談の理由文（「ペットは要相談です」）に使う */
export function featureSubject(tag: string): string {
  return featureLabel(tag).replace(/(利用)?(可|要相談)$/, "");
}

/** "オートロック、バス・トイレ別、ペット相談" → ["auto_lock", "separate_bath_toilet", "pet_negotiable"] */
export function extractFeatures(text: string): string[] {
  const s = text.normalize("NFKC");
  const tags = Object.entries(FEATURE_DICTIONARY)
    .filter(([, def]) => {
      if (def.patterns.length === 0) return false;
      // 否定表現を先に見る
      if (def.deny?.some((p) => p.test(s))) return false;
      return def.patterns.some((p) => p.test(s));
    })
    .map(([tag]) => tag);
  // 「ペット可」と「大型犬相談可」が並ぶような場合は「可」を採る
  return tags.filter((t) => {
    const ok = FEATURE_DICTIONARY[t]?.negotiableOf;
    return !ok || !tags.includes(ok);
  });
}

/** 向きは主要開口部（バルコニー）の方位。南向き系は soft 条件 "south_facing" として扱う */
export function directionFeatures(direction: string | null): string[] {
  if (direction == null) return [];
  return /南/.test(direction) ? ["south_facing"] : [];
}

/** 所在階と総階数から付けるタグ（最上階）。2階建て以下は眺望の意味が薄いので付けない */
export function floorFeatures(floor: number | null, totalFloors: number | null): string[] {
  if (floor == null || totalFloors == null) return [];
  return floor >= 3 && floor === totalFloors ? ["top_floor"] : [];
}
