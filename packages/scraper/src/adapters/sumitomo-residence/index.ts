import { createSumitomoAdapter } from "./sumitomo.js";

/**
 * 住友不動産の賃貸レジデンス（residence.sumitomo-latour.jp）。
 * ラ・トゥール以外の住友不動産の賃貸マンション。エリア別の建物一覧 → 空室一覧 → 部屋。
 * 江東区（豊洲）のエリアはサイトに無い。中央区は勝どき以外も含むので後段の isInTargetArea で絞る。
 */
const BASE_URL = "https://residence.sumitomo-latour.jp";
const AREAS = ["minato", "shibuya_meguro_setagaya", "chiyoda", "chuo", "shinagawa"];

export default createSumitomoAdapter({
  id: "sumitomo-residence",
  displayName: "住友不動産の賃貸レジデンス",
  baseUrl: BASE_URL,
  queries: AREAS.map((area) => ({ key: area, params: { area } })),
  buildListUrl: (q) => `${BASE_URL}/buildlist/${q.params.area}/`,
  defaultAreas: AREAS,
  parserVersion: "1",
});
