import type { Metadata } from "next";

/**
 * 検索・SNS 向けの共通設定。
 * 物件ページや会員の画面は第三者の掲載情報・個人の情報を含むため、検索エンジンに載せない。
 */
export const SITE_URL = "https://app.devote-inc.jp";

export const SITE_NAME = "Devote";

export const SITE_TITLE = "Devote｜港区・渋谷区の住まいとオフィス探しを任せる、物件コンシェルジュ";

export const SITE_DESCRIPTION =
  "港区・渋谷区・千代田区など都心6エリアの物件探しを任せられるコンシェルジュ。住まいの賃貸・売買、オフィスや店舗の事業用賃貸に対応。ご希望を一度伝えれば、合う物件だけを LINE かメールでお届けします。";

/** 会員の画面・物件ページ（索引にもリンクの追跡にも使わせない） */
export const PRIVATE_ROBOTS = {
  index: false,
  follow: false,
  nocache: true,
} as const satisfies Metadata["robots"];

/** OG の共通項目（子のページで openGraph を指定すると丸ごと置き換わるため、広げて使う） */
export const BASE_OPEN_GRAPH = {
  type: "website",
  siteName: SITE_NAME,
  locale: "ja_JP",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
} as const satisfies Metadata["openGraph"];
