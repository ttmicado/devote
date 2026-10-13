"use server";

import { getDb, users } from "@devote/db";
import { eq } from "drizzle-orm";
import { latestCondition } from "@/lib/data";
import { currentUserId } from "@/lib/session";

export type HeaderState = {
  /** ログインID のあるアカウントでログインしている */
  signedIn: boolean;
  /** 確定したご希望がある（ヘッダーの CTA を「最新のご提案」にする） */
  hasCondition: boolean;
};

/**
 * ヘッダーの出し分けに使う会員の状態。
 * ルートレイアウトで Cookie を読むと全ページが動的になる（トップの再生成が効かない）ため、
 * ヘッダー（クライアント）からこの Server Function を呼んで後から反映する。
 */
export async function headerState(): Promise<HeaderState> {
  try {
    const userId = await currentUserId();
    if (!userId) return { signedIn: false, hasCondition: false };
    const [[me], condition] = await Promise.all([
      getDb().select({ loginId: users.loginId }).from(users).where(eq(users.id, userId)),
      latestCondition(userId),
    ]);
    return { signedIn: Boolean(me?.loginId), hasCondition: Boolean(condition) };
  } catch (e) {
    console.error("[header] 会員の状態を読めませんでした", e);
    return { signedIn: false, hasCondition: false };
  }
}
