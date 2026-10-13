"use server";

import { getDb, users } from "@devote/db";
import { verifyUserLink } from "@devote/services";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { safePath } from "@/lib/safe-path";
import { setSessionCookie } from "@/lib/session";

/** 通知のリンクのアカウントに、この端末のセッションを切り替える（確認画面のボタンから） */
export async function switchSession(formData: FormData) {
  const next = safePath(String(formData.get("next") ?? ""));
  const userId = verifyUserLink(String(formData.get("t") ?? ""));
  if (!userId) redirect(`/session/switch?expired=1&next=${encodeURIComponent(next)}`);
  const [target] = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!target) redirect(next);
  // パスワードを設定済みのアカウントはログイン画面から
  if (target.passwordHash) redirect(`/login?next=${encodeURIComponent(next)}`);
  await setSessionCookie(target.id, target.sessionVersion);
  redirect(next);
}
