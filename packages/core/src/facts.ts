import { extractFeatures, floorFeatures } from "./features";
import { parseAvailableFrom, parseContractType } from "./normalize";
import type { NormalizedListing } from "./property";

/**
 * アダプターが extra に表記どおり残した値から、構造化できる項目を後から埋める（取り込み時に共通で通す）。
 * アダプターごとに同じ処理を書かずに済むよう、ここで項目名の揺れを吸収する。
 * - 既に値が入っている項目は上書きしない（アダプターが直接埋めた値を優先）
 * - 何度通しても結果が変わらない（冪等）
 */
const KEYS = {
  availableFrom: [
    "入居可能時期",
    "入居時期",
    "入居可能日",
    "入居可能年月",
    "入居日",
    "引渡時期",
    "引渡し時期",
  ],
  contract: ["契約形態", "契約区分", "借家契約"],
  term: ["契約期間", "契約期間（期日）"],
  renewalFee: ["更新料", "償却/更新料"],
  parking: ["駐車場"],
  totalUnits: ["総戸数", "戸数", "構造/総戸数"],
} as const;

function pick(extra: Record<string, string>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = extra[k]?.trim();
    if (v) return v;
  }
  return null;
}

/** "総戸数445戸、賃貸戸数106戸" → 445 / "38戸" → 38 / "RC / 120戸" → 120 */
export function parseTotalUnits(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = input.normalize("NFKC").replace(/[,\s]/g, "");
  const m = s.match(/総戸数[:：]?(\d+)/) ?? s.match(/(\d+)戸/);
  const n = m?.[1] ? Number(m[1]) : null;
  return n != null && n > 0 ? n : null;
}

/** "無 / 1.25ヶ月"（償却/更新料）のような併記から更新料の側を取り出す */
function renewalPart(key: string | null, value: string): string {
  if (key === "償却/更新料") {
    const parts = value.split(/\s*[/／]\s*/);
    return (parts[1] ?? value).trim();
  }
  return value;
}

export function deriveContractFacts(
  listing: NormalizedListing,
  now: Date = new Date(),
): NormalizedListing {
  const extra = listing.extra ?? {};
  const rent = listing.dealType === "rent";
  const features = new Set(listing.features);

  // 売買の「定借」は定期借地権のこと。定期借家タグは賃貸だけ
  if (!rent) features.delete("fixed_term");

  const availableFrom =
    listing.availableFrom ?? parseAvailableFrom(pick(extra, KEYS.availableFrom), now);

  let contractType = listing.contractType ?? null;
  let contractTermMonths = listing.contractTermMonths ?? null;
  if (rent) {
    const c = parseContractType(pick(extra, KEYS.contract));
    const t = parseContractType(pick(extra, KEYS.term));
    contractType ??= c.contractType ?? t.contractType;
    contractTermMonths ??= c.termMonths ?? t.termMonths;
    if (contractType == null && features.has("fixed_term")) contractType = "fixed_term";
    if (contractType === "fixed_term") features.add("fixed_term");
    if (contractType === "normal") features.delete("fixed_term");
  }

  const renewalKey = KEYS.renewalFee.find((k) => extra[k]?.trim()) ?? null;
  const renewalFee =
    listing.renewalFee ??
    (renewalKey ? renewalPart(renewalKey, (extra[renewalKey] as string).trim()) : null);

  const parkingNote = listing.parkingNote ?? pick(extra, KEYS.parking);
  if (parkingNote) {
    for (const f of extractFeatures(`駐車場 ${parkingNote}`)) {
      if (f === "parking" || f === "parking_flat" || f === "ev_charger") features.add(f);
    }
  }

  const totalUnits = listing.totalUnits ?? parseTotalUnits(pick(extra, KEYS.totalUnits));

  for (const f of floorFeatures(listing.floor, listing.totalFloors)) features.add(f);

  return {
    ...listing,
    features: [...features],
    availableFrom: availableFrom ?? null,
    contractType: contractType ?? null,
    contractTermMonths: contractTermMonths ?? null,
    renewalFee: renewalFee ?? null,
    parkingNote: parkingNote ?? null,
    totalUnits: totalUnits ?? null,
  };
}
