/**
 * 設備・条件の自由記述をタグに正規化する辞書。
 * サイトごとの言い回しの違いはここに集約し、マッチング・類似度計算はタグで行う。
 * 新しい表記を見つけたら patterns に追加する。
 */
export const FEATURE_DICTIONARY: Record<string, { label: string; patterns: RegExp[] }> = {
  auto_lock: { label: "オートロック", patterns: [/オートロック/] },
  separate_bath_toilet: { label: "バス・トイレ別", patterns: [/バス.?トイレ別|BT別/] },
  independent_washbasin: { label: "独立洗面台", patterns: [/独立洗面|洗面所独立/] },
  indoor_laundry: { label: "室内洗濯機置場", patterns: [/室内洗濯(機)?置/] },
  delivery_box: { label: "宅配ボックス", patterns: [/宅配(ボックス|BOX)/i] },
  reheating_bath: { label: "追い焚き", patterns: [/追(い)?焚/] },
  bathroom_dryer: { label: "浴室乾燥機", patterns: [/浴室(換気)?乾燥/] },
  free_internet: {
    label: "インターネット無料",
    patterns: [/(ネット|インターネット)(使用料)?無料/],
  },
  air_conditioner: { label: "エアコン", patterns: [/エアコン|冷暖房/] },
  system_kitchen: { label: "システムキッチン", patterns: [/システムキッチン/] },
  two_burner_stove: { label: "2口以上コンロ", patterns: [/[2-4二三]口(以上)?(コンロ|ガス|IH)/] },
  pet_ok: { label: "ペット可", patterns: [/ペット(可|相談)/] },
  instrument_ok: { label: "楽器可", patterns: [/楽器(可|相談)/] },
  office_ok: { label: "事務所利用可", patterns: [/事務所(利用)?(可|相談)/] },
  two_person_ok: { label: "二人入居可", patterns: [/二人入居|2人入居/] },
  designers: { label: "デザイナーズ", patterns: [/デザイナーズ/] },
  renovated: { label: "リノベーション", patterns: [/リノベ/] },
  corner_room: { label: "角部屋", patterns: [/角部屋/] },
  free_rent: { label: "フリーレント", patterns: [/フリーレント/] },
};

/** "オートロック、バス・トイレ別、ペット相談" → ["auto_lock", "separate_bath_toilet", "pet_ok"] */
export function extractFeatures(text: string): string[] {
  const s = text.normalize("NFKC");
  return Object.entries(FEATURE_DICTIONARY)
    .filter(([, def]) => def.patterns.some((p) => p.test(s)))
    .map(([tag]) => tag);
}

/** 向きは主要開口部（バルコニー）の方位。南向き系は soft 条件 "south_facing" として扱う */
export function directionFeatures(direction: string | null): string[] {
  if (direction == null) return [];
  return /南/.test(direction) ? ["south_facing"] : [];
}
