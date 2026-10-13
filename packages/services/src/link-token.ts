import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 通知のリンクに付ける署名付きトークン。
 * LINE のアプリ内ブラウザは Safari / Chrome と Cookie を共有しないため、
 * 通知から開いたときに「別人」扱いにならないよう、リンクからセッションを引き継ぐ。
 * 転送されたときのリスクを抑えるため有効期限は3日と短めにする。パスワードを設定済みのアカウントはリンクだけではログインさせない（本格公開時は LINE ログインに置き換える）。
 */
const TTL_MS = 3 * 24 * 3600_000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET（16文字以上）を設定してください");
  return s;
}

const mac = (payload: string) =>
  createHmac("sha256", secret()).update(`link:${payload}`).digest("base64url");

export function signUserLink(userId: string, now = Date.now()): string {
  const payload = `${userId}.${(now + TTL_MS).toString(36)}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(payload)}`;
}

export function verifyUserLink(token: string, now = Date.now()): string | null {
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

/** 通知内のリンク: トークンがあれば /api/session/claim を経由して本人を引き継ぐ */
export function personalLink(appUrl: string, path: string, userId?: string): string {
  if (!userId || !process.env.SESSION_SECRET) return `${appUrl}${path}`;
  const t = signUserLink(userId);
  return `${appUrl}/api/session/claim?t=${t}&next=${encodeURIComponent(path)}`;
}
