/**
 * 会員サイトのログイン失敗を繰り返さないための判定（純関数）。
 *
 * 人と同じIDで巡回しているので、パスワード変更・アカウント停止・追加認証などでログインできなくなったときに
 * 30分ごとの定期実行がログインを試し続けると、アカウントがロックされて人の業務も止まる。
 * 前回の巡回がログイン系の失敗なら、HOLD_HOURS の間は再試行しない（その間に人が確認する）。
 */
export const LOGIN_HOLD_HOURS = 24;

/** ログイン系の失敗（自動では直らず、人の確認が要るもの）のエラー文 */
const LOGIN_FAILURE =
  /ログインに失敗|追加認証|reCAPTCHA|ConcurrentLogin|ログインを送信しない|セッション切れ/;

export function loginHoldReason(
  lastRun: { status: string; error: string | null; startedAt: Date } | undefined,
  now: Date,
): string | null {
  if (!lastRun || lastRun.status !== "failed" || !lastRun.error) return null;
  if (!LOGIN_FAILURE.test(lastRun.error)) return null;
  const until = lastRun.startedAt.getTime() + LOGIN_HOLD_HOURS * 3_600_000;
  if (now.getTime() >= until) return null;
  return `前回ログインに失敗したため ${LOGIN_HOLD_HOURS} 時間停止中（${lastRun.error.slice(0, 80)}）`;
}
