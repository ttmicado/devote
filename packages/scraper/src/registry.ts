import type { SiteAdapter } from "./adapter.js";
import axelHome from "./adapters/axel-home/index.js";
import kencorp from "./adapters/kencorp/index.js";
import moriLiving from "./adapters/mori-living/index.js";
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
];

export const adapters: Record<string, SiteAdapter> = Object.fromEntries(
  registrations.map((r) => [r.adapter.meta.id, r.adapter]),
);

export const sourceRegistrations: readonly Registration[] = registrations;

/**
 * 定期巡回の対象。
 * - 未検証のアダプター（会員サイトのたたき台など）は ENABLE_UNVERIFIED_SOURCES=1 のときだけ含める
 * - DEVOTE_SOURCES=id1,id2 で対象を絞れる（実行環境ごとに分けるとき用）
 */
export function enabledAdapters(): SiteAdapter[] {
  const allowUnverified = process.env.ENABLE_UNVERIFIED_SOURCES === "1";
  const only = process.env.DEVOTE_SOURCES?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return registrations
    .filter((r) => r.production && (r.verified || allowUnverified))
    .map((r) => r.adapter)
    .filter((a) => !only || only.length === 0 || only.includes(a.meta.id));
}
