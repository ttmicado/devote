import type { SiteAdapter } from "./adapter.js";
import sampleRealtor from "./adapters/sample-realtor/index.js";

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
