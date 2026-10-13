import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * メールの配信停止リンク（List-Unsubscribe）に付ける署名付きトークン。
 * - ログインなしで、そのユーザーのメール配信だけを止められる（ほかの操作はできない）
 * - メールは後から開かれることが多いので有効期限は長め（180日）
 * - 用途ごとに署名を分ける（purpose = "unsub"）ため、通知リンクのトークンとは取り違えない
 */
const TTL_MS = 180 * 24 * 3600_000;
const PURPOSE = "unsub";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET（16文字以上）を設定してください");
  return s;
}

const mac = (payload: string) =>
  createHmac("sha256", secret()).update(`${PURPOSE}:${payload}`).digest("base64url");

export function signUnsubscribeToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${(now + TTL_MS).toString(36)}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(payload)}`;
}

/** 正しければ userId、改ざん・期限切れなら null */
export function verifyUnsubscribeToken(token: string, now = Date.now()): string | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(mac(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [userId, exp] = payload.split(".");
  if (!userId || !exp || Number.parseInt(exp, 36) < now) return null;
  return userId;
}

/** 配信停止のURL。SESSION_SECRET がなければ（ローカル開発）お届け設定の画面へ */
export function unsubscribeUrl(appUrl: string, userId: string): string {
  if (!process.env.SESSION_SECRET) return `${appUrl}/settings`;
  return `${appUrl}/api/unsubscribe?t=${signUnsubscribeToken(userId)}`;
}
