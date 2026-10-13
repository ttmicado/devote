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
    throw new Error(`LINE API ${path} ${res.status}: ${await res.text()}`);
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
