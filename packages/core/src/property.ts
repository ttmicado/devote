import { z } from "zod";

/** 取引種別 */
export const DealType = z.enum(["rent", "sale"]);
export type DealType = z.infer<typeof DealType>;

/** 取引態様（元付=貸主/代理/専任媒介/一般媒介、客付=仲介） */
export const TransactionMode = z.enum([
  "owner", // 貸主・売主
  "agent", // 代理
  "exclusive_agency", // 専属専任・専任媒介
  "general_agency", // 一般媒介
  "brokerage", // 仲介（客付）
  "unknown",
]);
export type TransactionMode = z.infer<typeof TransactionMode>;

/** 掲載状態（差分検知で更新） */
export const ListingStatus = z.enum(["active", "price_changed", "closed"]);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const StationAccess = z.object({
  line: z.string().nullable(), // 路線名 例: "東急東横線"
  station: z.string(), // 駅名（「駅」を除いた正規化済み） 例: "中目黒"
  walkMinutes: z.number().int().nonnegative().nullable(),
  busMinutes: z.number().int().nonnegative().nullable(),
});
export type StationAccess = z.infer<typeof StationAccess>;

/**
 * 正規化済みの物件（1ソースの1掲載 = Listing）。
 * サイトごとのアダプターは生データをこの形に変換して返す。
 * 金額はすべて「円」、面積は「㎡」で保持する。
 */
export const NormalizedListing = z.object({
  source: z.string(), // アダプターID 例: "reins", "sample-realtor"
  sourceListingId: z.string(), // ソース内の物件番号
  url: z.string().url(),
  dealType: DealType,
  title: z.string().nullable(), // 建物名
  address: z.object({
    prefecture: z.string().nullable(),
    city: z.string().nullable(),
    town: z.string().nullable(),
    raw: z.string(),
  }),
  stations: z.array(StationAccess),
  price: z.number().int().positive(), // 賃料 or 価格（円）
  managementFee: z.number().int().nonnegative().nullable(), // 管理費・共益費（円/月）
  deposit: z.number().int().nonnegative().nullable(), // 敷金（円）
  keyMoney: z.number().int().nonnegative().nullable(), // 礼金（円）
  layout: z.string().nullable(), // 正規化済み 例: "1LDK"
  areaSqm: z.number().positive().nullable(),
  builtYearMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(), // "YYYY-MM"
  floor: z.number().int().nullable(), // 所在階（地下は負数）
  totalFloors: z.number().int().positive().nullable(),
  structure: z.string().nullable(), // RC / SRC / 木造 など
  direction: z.string().nullable(), // 向き 例: "南"
  features: z.array(z.string()), // 設備・条件タグ（正規化済み） 例: "pet_ok", "auto_lock"
  transactionMode: TransactionMode,
  adAllowed: z.boolean().nullable(), // 広告可否（レインズ等で取得できる場合）
  agencyName: z.string().nullable(), // 掲載業者（元付）
  imageUrls: z.array(z.string().url()),
  sourceUpdatedAt: z.string().datetime().nullable(),
  /** 売買: 修繕積立金（円/月） */
  repairReserveFee: z.number().int().nonnegative().nullable().default(null),
  /** 物件種別（売買で使う。賃貸は "mansion" 扱いでよい） */
  propertyType: z.enum(["mansion", "house", "land", "other"]).nullable().default(null),
  /** 構造化しきれないサイト固有の値（表記どおり） */
  extra: z.record(z.string(), z.string()).default({}),
});
export type NormalizedListing = z.infer<typeof NormalizedListing>;
/** アダプターの normalize が返す型（default 付き項目は省略可） */
export type NormalizedListingInput = z.input<typeof NormalizedListing>;
