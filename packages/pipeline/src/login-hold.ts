/**
 * 会員サイトで巡回が止まったときの「待ってから再開」の判定（純関数）。
 *
 * 人と同じIDで巡回しているので、止まる理由によって待つ時間を変える。待ち時間が過ぎたら次の定期実行で
 * 自動的に再開し、また止まればその時点から同じだけ待つ。
 * - 使用中（同じIDで人が利用中・同時ログイン不可）: 人の作業が終わるのを待つ（既定 60分）
 * - セッション切れ: 時間をおいてログインし直す（既定 30分）
 * - ログイン失敗・追加認証・CAPTCHA: 30分ごとに試し続けるとアカウントがロックされて人の業務も止まるので、
 *   長く待つ（既定 24時間。その間に人が確認する）
 */
export type HoldKind = "in_use" | "session" | "auth";

const HOLD_RULES: { kind: HoldKind; pattern: RegExp; label: string }[] = [
  {
    kind: "in_use",
    pattern: /ConcurrentLogin|利用中|同時ログイン/,
    label: "同じIDで利用中",
  },
  { kind: "session", pattern: /セッション切れ/, label: "セッション切れ" },
  {
    kind: "auth",
    pattern: /ログインに失敗|追加認証|reCAPTCHA|ログインを送信しない/,
    label: "ログインに失敗",
  },
];

/** 理由ごとの待ち時間（分）。環境変数 LOGIN_HOLD_<KIND>_MINUTES で変更できる */
export function holdMinutes(kind: HoldKind, env: NodeJS.ProcessEnv = process.env): number {
  const defaults: Record<HoldKind, number> = { in_use: 60, session: 30, auth: 24 * 60 };
  const v = Number(env[`LOGIN_HOLD_${kind.toUpperCase()}_MINUTES`]);
  return Number.isFinite(v) && v >= 0 ? v : defaults[kind];
}

/** 前回の巡回のエラーが、待ってから再開すべき止まり方か */
export function classifyHold(error: string | null): HoldKind | null {
  if (!error) return null;
  return HOLD_RULES.find((r) => r.pattern.test(error))?.kind ?? null;
}

/** 待機中ならその理由（ログ・巡回の記録に出す）、再開してよければ null */
export function loginHoldReason(
  lastRun: { status: string; error: string | null; startedAt: Date } | undefined,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!lastRun || lastRun.status !== "failed") return null;
  const kind = classifyHold(lastRun.error);
  if (!kind) return null;
  const minutes = holdMinutes(kind, env);
  const until = new Date(lastRun.startedAt.getTime() + minutes * 60_000);
  if (now >= until) return null;
  const label = HOLD_RULES.find((r) => r.kind === kind)?.label ?? kind;
  const hhmm = until.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `前回「${label}」で止まったため ${hhmm} まで待機（${minutes}分。${(lastRun.error ?? "").slice(0, 80)}）`;
}
