/**
 * 運営会社と宅地建物取引業者としての表示（フッター・会社概要・通知メールで共用）。
 * 値が null の項目は表示しない。正式な値は運営側で確認して埋める。
 */
export const COMPANY = {
  /** 商号 */
  name: "株式会社Devote",
  /** サービス名 */
  service: "Devote",
  /** 宅地建物取引業の免許番号（例: 東京都知事(1)第000000号） */
  license: "東京都知事免許（2）第104045号" as string | null,
  /** 所属団体（例: 公益社団法人 東京都宅地建物取引業協会） */
  association: "公益社団法人全日本不動産協会、公益社団法人首都圏不動産公正取引協議会" as
    | string
    | null,
  /** 保証協会（例: 公益社団法人 全国宅地建物取引業保証協会） */
  guaranty: "公益社団法人不動産保証協会" as string | null,
  /** 本店所在地 */
  address: "〒108-0014 東京都港区芝5-32-12 シャーメゾンステージ田町6階" as string | null,
  /** 代表者 */
  representative: "代表取締役社長 大橋卓弥" as string | null,
  /** 電話番号と受付時間 */
  phone: "03-6822-7441" as string | null,
  hours: null as string | null,
  /** お問い合わせ用メールアドレス */
  email: null as string | null,
  /** コーポレートサイト */
  url: "https://devote-inc.jp",
  /** お問い合わせフォーム（コーポレートサイト） */
  contactUrl: "https://devote-inc.jp/contact/" as string | null,
  /** 取引態様（お客様向けの表示は常に Devote の立場） */
  transactionMode: "仲介（媒介）",
} as const;

/** 表示できる会社情報の行（値のあるものだけ） */
export function companyRows(): [string, string][] {
  const rows: [string, string | null][] = [
    ["商号", COMPANY.name],
    ["免許番号", COMPANY.license],
    ["所属団体", COMPANY.association],
    ["保証協会", COMPANY.guaranty],
    ["所在地", COMPANY.address],
    ["代表者", COMPANY.representative],
    [
      "電話",
      COMPANY.phone && COMPANY.hours ? `${COMPANY.phone}（${COMPANY.hours}）` : COMPANY.phone,
    ],
    ["メール", COMPANY.email],
  ];
  return rows.filter((r): r is [string, string] => r[1] != null);
}
