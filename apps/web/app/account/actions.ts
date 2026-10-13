"use server";

import { getDb, users } from "@devote/db";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { hashPassword, MIN_PASSWORD, normalizeLoginId, verifyPassword } from "@/lib/password";
import { clearSessionCookie, currentUserId, ensureUserId, setSessionCookie } from "@/lib/session";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

/**
 * アカウントを作る（またはニックネーム・パスワードを変更する）。
 * いまの端末で相談した内容・条件・問い合わせは、そのままこのアカウントに引き継ぐ。
 */
export async function saveAccount(formData: FormData) {
  const userId = await ensureUserId();
  const db = getDb();
  const nickname = String(formData.get("nickname") ?? "")
    .trim()
    .slice(0, 30);
  const loginIdRaw = String(formData.get("loginId") ?? "");
  const password = String(formData.get("password") ?? "");
  const [me] = await db.select().from(users).where(eq(users.id, userId));
  if (!nickname) redirect("/account?error=nickname");

  const updates: Partial<typeof users.$inferInsert> = { nickname, updatedAt: new Date() };
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
    updates.passwordHash = await hashPassword(password);
  }
  await db.update(users).set(updates).where(eq(users.id, userId));
  redirect(me?.loginId ? "/account?saved=1" : "/account?created=1");
}

/** 別の端末・ブラウザからログインする */
export async function login(formData: FormData) {
  const db = getDb();
  const loginId = normalizeLoginId(String(formData.get("loginId") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/matches");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/matches";
  if (!loginId || !password) redirect("/login?error=invalid");

  const [u] = await db.select().from(users).where(eq(users.loginId, loginId));
  if (u?.lockedUntil && u.lockedUntil > new Date()) redirect("/login?error=locked");
  const ok = u?.passwordHash ? await verifyPassword(password, u.passwordHash) : false;
  if (!u || !ok) {
    if (u) {
      const failed = u.failedLogins + 1;
      await db
        .update(users)
        .set({
          failedLogins: failed >= LOCK_AFTER ? 0 : failed,
          lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        })
        .where(eq(users.id, u.id));
    }
    redirect("/login?error=invalid");
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  await setSessionCookie(u.id);
  redirect(safeNext);
}

export async function logout() {
  if (await currentUserId()) await clearSessionCookie();
  redirect("/");
}
