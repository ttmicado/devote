import { createSumitomoAdapter } from "../sumitomo-residence/sumitomo.js";

/**
 * ラ・トゥール（www.sumitomo-latour.jp）。住友不動産の高級賃貸ブランド。
 * residence.sumitomo-latour.jp と同じCMSだが建物（ラ・トゥールシリーズ）が別なので別ソースとする。
 * エリア別の建物一覧ページが無い（/buildlist/<area>/ はトップへリダイレクト）ため、
 * トップのラインナップ（全ページ共通のナビ）から対象エリアの建物を拾って空室一覧を巡回する。
 */
const BASE_URL = "https://www.sumitomo-latour.jp";
/** 港・品川 / 渋谷 / 千代田・文京（新宿・関西・札幌は対象外） */
const AREAS = ["minato_area", "shibuya_area", "chiyoda-bunkyo_area"];

export default createSumitomoAdapter({
  id: "sumitomo-latour",
  displayName: "ラ・トゥール（住友不動産の高級賃貸）",
  baseUrl: BASE_URL,
  queries: [{ key: "lineup", params: {} }],
  buildListUrl: () => `${BASE_URL}/`,
  defaultAreas: AREAS,
  parserVersion: "1",
});
