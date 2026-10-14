import type { SiteAdapter } from "./adapter.js";
import atbb, { VERIFIED as ATBB_VERIFIED } from "./adapters/atbb/index.js";
import axelHome from "./adapters/axel-home/index.js";
import itandiBb, { VERIFIED as ITANDI_VERIFIED } from "./adapters/itandi-bb/index.js";
import kencorp from "./adapters/kencorp/index.js";
import moriLiving from "./adapters/mori-living/index.js";
import reins, { VERIFIED as REINS_VERIFIED } from "./adapters/reins/index.js";
import rf12 from "./adapters/rf12/index.js";
import sampleRealtor from "./adapters/sample-realtor/index.js";
import sumitomoLatour from "./adapters/sumitomo-latour/index.js";
import sumitomoResidence from "./adapters/sumitomo-residence/index.js";

interface Registration {
  adapter: SiteAdapter;
  /** 本番の巡回対象か（sample-realtor のようなデモは false） */
  production: boolean;
  /** 実サイト（ログイン後の画面を含む）で動作確認済みか */
  verified: boolean;
  /**
   * 業者間の会員サイト（レインズ・ATBB・ITANDI BB）。ここだけに載る物件は一般公開せず、
   * ご提案を受けた会員にだけ見せる（apps/web/lib/data.ts の MEMBER_ONLY_SOURCES と揃える）
   */
  memberOnly?: boolean;
}

/** 新しいソースはここに登録する */
const registrations: Registration[] = [
  { adapter: sampleRealtor, production: false, verified: true },
  // 不動産会社の自社サイト（レインズに載せない傾向の会社）
  { adapter: sumitomoResidence, production: true, verified: true },
  { adapter: sumitomoLatour, production: true, verified: true },
  { adapter: moriLiving, production: true, verified: true },
  { adapter: rf12, production: true, verified: true },
  { adapter: kencorp, production: true, verified: true },
  { adapter: axelHome, production: true, verified: true },
  // 業者間の会員サイト（docs/member-sites.md）。レインズ・ITANDI BB は 2026-10-14 にログイン後の実画面で確認済み。
  // ATBB は同じIDを人が使用中（同時ログイン不可）で検索画面に入れず未確認。
  // 会員サイトは ENABLE_MEMBER_SOURCES=1 のときだけ巡回する（下の enabledAdapters）
  { adapter: reins, production: true, verified: REINS_VERIFIED, memberOnly: true },
  { adapter: atbb, production: true, verified: ATBB_VERIFIED, memberOnly: true },
  { adapter: itandiBb, production: true, verified: ITANDI_VERIFIED, memberOnly: true },
];

export const adapters: Record<string, SiteAdapter> = Object.fromEntries(
  registrations.map((r) => [r.adapter.meta.id, r.adapter]),
);

export const sourceRegistrations: readonly Registration[] = registrations;

/** 会員サイト（一般公開してはいけない情報源）の ID */
export const memberOnlySourceIds: readonly string[] = registrations
  .filter((r) => r.memberOnly)
  .map((r) => r.adapter.meta.id);

/**
 * 定期巡回の対象。
 * - 未検証のアダプター（会員サイトのたたき台など）は ENABLE_UNVERIFIED_SOURCES=1 のときだけ含める
 * - 会員サイト（memberOnly）は ENABLE_MEMBER_SOURCES=1 のときだけ含める。ログインする ID は人も使うため、
 *   巡回専用ID・実行環境（国内のセルフホストランナー推奨）を用意してから明示的に有効にする
 * - DEVOTE_SOURCES=id1,id2 で対象を絞れる（実行環境ごとに分けるとき用）
 */
export function enabledAdapters(): SiteAdapter[] {
  const allowUnverified = process.env.ENABLE_UNVERIFIED_SOURCES === "1";
  const allowMember = process.env.ENABLE_MEMBER_SOURCES === "1";
  const only = process.env.DEVOTE_SOURCES?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return registrations
    .filter((r) => r.production && (r.verified || allowUnverified))
    .filter((r) => !r.memberOnly || allowMember)
    .map((r) => r.adapter)
    .filter((a) => !only || only.length === 0 || only.includes(a.meta.id));
}
