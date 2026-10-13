"use server";

import { getDb, users } from "@devote/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  hashPassword,
  MIN_PASSWORD,
  normalizeLoginId,
  verifyDummyPassword,
  verifyPassword,
} from "@/lib/password";
import { clientIp, hit } from "@/lib/rate-limit";
import { safePath } from "@/lib/safe-path";
import { clearSessionCookie, currentUserId, ensureUserId, setSessionCookie } from "@/lib/session";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

/**
 * アカウントを作る（またはニックネーム・パスワードを変更する）。
 * いまの端末で相談した内容・条件・問い合わせは、そのままこのアカウントに引き継ぐ。
 * パスワードの変更には、いまのパスワード（currentPassword）が必要。変更すると他の端末はログアウトになる。
 */
export async function saveAccount(formData: FormData) {
  const userId = await ensureUserId();
  const db = getDb();
  const nickname = String(formData.get("nickname") ?? "")
    .trim()
    .slice(0, 30);
  const loginIdRaw = String(formData.get("loginId") ?? "");
  const password = String(formData.get("password") ?? "");
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const [me] = await db.select().from(users).where(eq(users.id, userId));
  if (!nickname) redirect("/account?error=nickname");
  if (password.length > 256) redirect("/account?error=password");

  const updates: Partial<typeof users.$inferInsert> = { nickname, updatedAt: new Date() };
  let passwordChanged = false;
  if (!me?.loginId) {
    // 新規作成: ログインIDとパスワードは必須
    const loginId = normalizeLoginId(loginIdRaw);
    if (!loginId) redirect("/account?error=loginId");
    if (password.length < MIN_PASSWORD) redirect("/account?error=password");
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.loginId, loginId), ne(users.id, userId)));
    if (taken) redirect("/account?error=taken");
    updates.loginId = loginId;
    updates.passwordHash = await hashPassword(password);
  } else if (password) {
    if (password.length < MIN_PASSWORD) redirect("/account?error=password");
    // 開いたままの端末から第三者に変えられないよう、いまのパスワードを確かめる
    if (me.passwordHash && !(await verifyPassword(currentPassword, me.passwordHash))) {
      redirect("/account?error=currentPassword");
    }
    updates.passwordHash = await hashPassword(password);
    passwordChanged = true;
  }
  if (passwordChanged) {
    // 世代を上げて、ほかの端末のセッションを無効にする（この端末は新しい世代で入り直す）
    const [u] = await db
      .update(users)
      .set({ ...updates, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, userId))
      .returning({ sessionVersion: users.sessionVersion });
    if (u) await setSessionCookie(userId, u.sessionVersion);
  } else {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }
  redirect(me?.loginId ? "/account?saved=1" : "/account?created=1");
}

/** 別の端末・ブラウザからログインする */
export async function login(formData: FormData) {
  const db = getDb();
  const loginId = normalizeLoginId(String(formData.get("loginId") ?? ""));
  const password = String(formData.get("password") ?? "").slice(0, 256);
  const safeNext = safePath(String(formData.get("next") ?? ""));
  // 総当たり対策: 同じ接続元からは 15 分に 20 回まで
  const ip = clientIp(await headers());
  if (!(await hit(`login:ip:${ip}`, 20, 15 * 60))) redirect("/login?error=invalid");
  if (!loginId || !password) redirect("/login?error=invalid");

  const [u] = await db.select().from(users).where(eq(users.loginId, loginId));
  // ID が存在しなくても同じだけ計算して、応答時間で ID の有無を推測させない
  const ok = u?.passwordHash
    ? await verifyPassword(password, u.passwordHash)
    : await verifyDummyPassword(password);
  const locked = Boolean(u?.lockedUntil && u.lockedUntil > new Date());
  if (!u || !ok || locked) {
    if (u && !locked) {
      // 同時に試されても取りこぼさないよう、DB 上で加算する
      await db
        .update(users)
        .set({
          failedLogins: sql`case when ${users.failedLogins} + 1 >= ${LOCK_AFTER} then 0 else ${users.failedLogins} + 1 end`,
          lockedUntil: sql`case when ${users.failedLogins} + 1 >= ${LOCK_AFTER} then now() + make_interval(mins => ${LOCK_MINUTES}) else ${users.lockedUntil} end`,
        })
        .where(eq(users.id, u.id));
    }
    // ロック中も同じ文言にして、アカウントの有無・状態を区別させない
    redirect("/login?error=invalid");
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  await setSessionCookie(u.id, u.sessionVersion);
  redirect(safeNext);
}

export async function logout() {
  if (await currentUserId()) await clearSessionCookie();
  redirect("/");
}
