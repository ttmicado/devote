import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LINE Messaging API（REST を直接呼ぶ）。
 * - push は月間の無料通数（コミュニケーションプラン=200通）に数えられるため、1回の通知は1メッセージにまとめる
 * - reply は無料。ユーザーからの話しかけには reply で返す
 */
const API = "https://api.line.me/v2/bot";

export type LineMessage = Record<string, unknown>;

function token(): string {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  return t;
}

/** LINE API のエラー（HTTP ステータスと本文を保持し、恒久的な失敗かを判定できるようにする） */
export class LineApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`LINE API ${path} ${status}: ${body}`);
    this.name = "LineApiError";
  }
}

/**
 * 再送しても届かない失敗か（友だち解除・ブロック・存在しないユーザー）。
 * この場合は LINE のチャネルを無効にして、以後はメールなどほかのチャネルで届ける。
 * 一時的な失敗（429・5xx）や、こちらの設定の問題（401・認可のない 403）は含めない。
 */
export function isPermanentLineFailure(e: unknown): boolean {
  if (!(e instanceof LineApiError)) return false;
  const userIssue =
    /not\s*found|blocked|unfollow|not\s*(a\s*)?friend|invalid\s*(user|to)|property,\s*'to'|the\s*user/i.test(
      e.body,
    );
  if (e.status === 404) return true;
  return (e.status === 400 || e.status === 403) && userIssue;
}

async function call(path: string, body: unknown, retryKey?: string): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
      // 再試行時の二重送信を防ぐ（UUID 形式）
      ...(retryKey ? { "x-line-retry-key": retryKey } : {}),
    },
    body: JSON.stringify(body),
  });
  // 409 = 同じ retry key で送信済み
  if (!res.ok && res.status !== 409) {
    throw new LineApiError(path, res.status, await res.text());
  }
}

export function pushLine(to: string, messages: LineMessage[], retryKey?: string) {
  return call("/message/push", { to, messages }, retryKey);
}

export function replyLine(replyToken: string, messages: LineMessage[]) {
  return call("/message/reply", { replyToken, messages });
}

/** Webhook の署名検証（X-Line-Signature） */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** 今月の送信数（無料枠の残りの確認用） */
export async function lineQuotaConsumption(): Promise<number | null> {
  const res = await fetch(`${API}/message/quota/consumption`, {
    headers: { authorization: `Bearer ${token()}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { totalUsage?: number };
  return json.totalUsage ?? null;
}
