"use server";

import { getDb, userChannels, verificationTokens } from "@devote/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

/** 確認画面のボタンから: トークンを原子的に使用済みにしてから、メールをお届け先として登録する */
export async function confirmEmail(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const db = getDb();
  // 同時に2回押されても1回だけ通るよう、「未使用かつ期限内」を条件に更新して結果を受け取る
  const [t] = token
    ? await db
        .update(verificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(verificationTokens.token, token),
            eq(verificationTokens.purpose, "email_verify"),
            isNull(verificationTokens.usedAt),
            gt(verificationTokens.expiresAt, new Date()),
          ),
        )
        .returning()
    : [];
  if (!t?.payload) redirect("/email/verify?result=expired");

  const [existing] = await db
    .select()
    .from(userChannels)
    .where(and(eq(userChannels.channel, "email"), eq(userChannels.address, t.payload)));
  if (existing) {
    // 別のアカウントで使われている（有効な）お届け先は奪わない。無効化済みなら引き継ぐ
    if (existing.userId !== t.userId && existing.active) redirect("/email/verify?result=taken");
    await db
      .update(userChannels)
      .set({ userId: t.userId, active: true, updatedAt: new Date() })
      .where(eq(userChannels.id, existing.id));
  } else {
    await db
      .insert(userChannels)
      .values({ userId: t.userId, channel: "email", address: t.payload, priority: 10 })
      .onConflictDoNothing();
  }
  redirect("/settings?email=verified");
}
