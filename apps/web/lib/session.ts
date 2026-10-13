import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb, users } from "@devote/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * 身内テスト用の簡易セッション: 初回アクセス時に匿名ユーザーを作り、署名付き Cookie で識別する。
 * 本格公開時は LINE ログイン等の認証に置き換える。
 */
const COOKIE = "devote_uid";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET（16文字以上）を設定してください");
  return s;
}

const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Cookie の値: `<userId>.<sessionVersion>.<hmac>` */
function sign(id: string, version: number): string {
  const payload = `${id}.${version}`;
  return `${payload}.${mac(payload)}`;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 署名を確かめて userId と世代を取り出す。旧形式（`<userId>.<hmac>`）は世代 0 として扱う */
export function verifySessionValue(
  value: string | undefined,
): { id: string; version: number } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length === 2) {
    const [id, sig] = parts;
    return id && sig && safeEqual(mac(id), sig) ? { id, version: 0 } : null;
  }
  if (parts.length === 3) {
    const [id, v, sig] = parts;
    if (!id || !v || !sig || !/^\d{1,9}$/.test(v)) return null;
    return safeEqual(mac(`${id}.${v}`), sig) ? { id, version: Number(v) } : null;
  }
  return null;
}

/** Server Component から読む（Cookie が無い・世代が古い（パスワード変更済み）なら null） */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const s = verifySessionValue(store.get(COOKIE)?.value);
  if (!s) return null;
  const [u] = await getDb()
    .select({ id: users.id, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, s.id));
  return u && u.sessionVersion === s.version ? u.id : null;
}

/** Route Handler / Server Action から呼ぶ（無ければユーザーを作って Cookie を発行） */
export async function ensureUserId(): Promise<string> {
  const existing = await currentUserId();
  if (existing) return existing;
  const id = randomUUID();
  await getDb().insert(users).values({ id });
  await setSessionCookie(id, 0);
  return id;
}

/** 指定ユーザーとしてログインした状態にする。version を省略すると DB の現在の世代を使う */
export async function setSessionCookie(userId: string, version?: number) {
  let v = version;
  if (v === undefined) {
    const [u] = await getDb()
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, userId));
    v = u?.sessionVersion ?? 0;
  }
  const store = await cookies();
  store.set(COOKIE, sign(userId, v), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** ログアウト（この端末のセッションを消す） */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}
