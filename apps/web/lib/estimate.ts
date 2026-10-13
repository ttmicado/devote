import type { NormalizedListing } from "@devote/core";

/** 仲介手数料にかかる消費税率 */
export const CONSUMPTION_TAX = 0.1;

export interface MoveInEstimate {
  /** 敷金（円）。掲載に無ければ null */
  deposit: number | null;
  /** 礼金（円）。掲載に無ければ null */
  keyMoney: number | null;
  /** 仲介手数料: 賃料1ヶ月分＋消費税（円） */
  brokerage: number;
  /** 前家賃: 1ヶ月分の総額（賃料＋管理費、円） */
  advanceRent: number;
  /** 分かっている項目の合計（円） */
  total: number;
  /** 敷金・礼金がどちらも分かっているか（false なら合計は一部の項目のみ） */
  complete: boolean;
}

/**
 * 住まいの賃貸の初期費用の概算（目安）。掲載されている金額だけから計算する（推測で埋めない）。
 * 保証会社・火災保険・鍵交換は物件ごとに異なるため含めない。売買・事業用は対象外で null。
 */
export function estimateMoveInCost(
  l: Pick<
    NormalizedListing,
    "dealType" | "usage" | "price" | "managementFee" | "deposit" | "keyMoney"
  >,
): MoveInEstimate | null {
  if (l.dealType !== "rent" || l.usage === "business") return null;
  const brokerage = Math.round(l.price * (1 + CONSUMPTION_TAX));
  const advanceRent = l.price + (l.managementFee ?? 0);
  const deposit = l.deposit ?? null;
  const keyMoney = l.keyMoney ?? null;
  const total = brokerage + advanceRent + (deposit ?? 0) + (keyMoney ?? 0);
  return {
    deposit,
    keyMoney,
    brokerage,
    advanceRent,
    total,
    complete: deposit != null && keyMoney != null,
  };
}

/** 敷金・礼金の円を「賃料の何ヶ月分か」にする（小数1桁。"1" / "1.5"）。賃料が無ければ null */
export function monthsOfRent(yen: number, rent: number): string | null {
  if (!(rent > 0)) return null;
  const m = Math.round((yen / rent) * 10) / 10;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}
