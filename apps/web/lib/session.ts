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

function sign(id: string): string {
  return `${id}.${createHmac("sha256", secret()).update(id).digest("base64url")}`;
}

function verify(value: string | undefined): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig) return null;
  const expected = Buffer.from(sign(id).split(".")[1] ?? "");
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** Server Component から読む（Cookie が無ければ null） */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const id = verify(store.get(COOKIE)?.value);
  if (!id) return null;
  const [u] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, id));
  return u?.id ?? null;
}

/** Route Handler / Server Action から呼ぶ（無ければユーザーを作って Cookie を発行） */
export async function ensureUserId(): Promise<string> {
  const existing = await currentUserId();
  if (existing) return existing;
  const id = randomUUID();
  await getDb().insert(users).values({ id });
  await setSessionCookie(id);
  return id;
}

/** 指定ユーザーとしてログインした状態にする（通知の署名付きリンクから） */
export async function setSessionCookie(userId: string) {
  const store = await cookies();
  store.set(COOKIE, sign(userId), {
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
