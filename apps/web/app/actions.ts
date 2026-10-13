"use server";

import { randomBytes, randomInt } from "node:crypto";
import { missingEssentials, SearchCondition } from "@devote/core";
import {
  getDb,
  inquiries,
  properties,
  searchConditions,
  userChannels,
  users,
  verificationTokens,
} from "@devote/db";
import { runMatching, sendEmail } from "@devote/services";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appUrl, currentUserId, ensureUserId } from "@/lib/session";

/** チャットで固めた下書き条件を確定し、通知対象にする */
export async function confirmCondition() {
  const userId = await ensureUserId();
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const parsed = SearchCondition.safeParse(u?.draftCondition);
  if (!parsed.success) redirect("/chat?error=condition");
  // エリア・ご予算・広さ（間取り）がそろわないまま確定すると、物件が大量に届いてしまう
  if (missingEssentials(parsed.data).length > 0) redirect("/chat?error=incomplete");
  const [prev] = await db
    .select()
    .from(searchConditions)
    .where(eq(searchConditions.userId, userId))
    .orderBy(desc(searchConditions.version))
    .limit(1);
  await db
    .update(searchConditions)
    .set({ active: false })
    .where(eq(searchConditions.userId, userId));
  await db.insert(searchConditions).values({
    userId,
    version: (prev?.version ?? 0) + 1,
    condition: parsed.data,
    phase:
      (u?.draftPhase as "exploring" | "considering" | "ready" | null) ?? prev?.phase ?? "exploring",
    // 「最速」が既定。夜間（22時〜8時）に見つかった分は朝8時にまとめて届ける
    frequency: prev?.frequency ?? "instant",
    sendHour: prev?.sendHour ?? 8,
  });
  // 確定した条件ですぐにマッチングして一覧に出す（このユーザーの分だけ）
  await runMatching(db, new Date(), { userId });
  // 受け取り方が未登録なら、そのままお届け設定へ
  const [channel] = await db
    .select({ id: userChannels.id })
    .from(userChannels)
    .where(and(eq(userChannels.userId, userId), eq(userChannels.active, true)))
    .limit(1);
  redirect(channel ? "/matches?confirmed=1" : "/settings?welcome=1");
}

const FREQUENCIES = ["instant", "daily", "weekly"] as const;
const PHASES = ["exploring", "considering", "ready"] as const;

export async function updateNotificationSettings(formData: FormData) {
  const userId = await currentUserId();
  if (!userId) redirect("/chat");
  const frequency = String(formData.get("frequency"));
  const phase = String(formData.get("phase"));
  const sendHour = Number(formData.get("sendHour"));
  const db = getDb();
  const [c] = await db
    .select()
    .from(searchConditions)
    .where(eq(searchConditions.userId, userId))
    .orderBy(desc(searchConditions.version))
    .limit(1);
  if (!c) redirect("/chat");
  await db
    .update(searchConditions)
    .set({
      frequency: FREQUENCIES.includes(frequency as never)
        ? (frequency as (typeof FREQUENCIES)[number])
        : c.frequency,
      phase: PHASES.includes(phase as never) ? (phase as (typeof PHASES)[number]) : c.phase,
      sendHour:
        Number.isInteger(sendHour) && sendHour >= 0 && sendHour <= 23 ? sendHour : c.sendHour,
      active: formData.get("active") === "on",
      updatedAt: new Date(),
    })
    .where(eq(searchConditions.id, c.id));
  redirect("/settings?saved=1");
}

export async function requestEmailVerification(formData: FormData) {
  const userId = await ensureUserId();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/settings?email=invalid");
  const token = randomBytes(24).toString("base64url");
  await getDb()
    .insert(verificationTokens)
    .values({
      token,
      userId,
      purpose: "email_verify",
      payload: email,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });
  const link = `${appUrl()}/api/email/verify?token=${token}`;
  let failed = false;
  try {
    await sendEmail({
      to: email,
      subject: "【Devote】メールアドレスのご確認",
      text: `Devote のコンシェルジュです。\n以下のリンクを開くと、物件のお届けをこのメールアドレスで受け取れるようになります（24時間有効）。\n${link}\n\nお心当たりがない場合は、このメールを破棄してください。`,
      html: verificationEmailHtml(link),
      idempotencyKey: token,
    });
  } catch (e) {
    // 送信できなかったときは画面を壊さず案内を出す。原因（APIキー・送信ドメイン未認証など）はログに残す
    console.error(`[email] 確認メールの送信に失敗: ${e instanceof Error ? e.message : String(e)}`);
    await getDb().delete(verificationTokens).where(eq(verificationTokens.token, token));
    failed = true;
  }
  redirect(failed ? "/settings?email=failed" : "/settings?email=sent");
}

function verificationEmailHtml(link: string) {
  return `<!doctype html><html lang="ja"><body style="margin:0;background:#f7efe2;padding:24px 12px;font-family:'Hiragino Sans','Yu Gothic',sans-serif;color:#26221e">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse">
<tr><td style="padding:8px 0 24px;text-align:center;border-bottom:1px solid #e3d4b9">
  <div style="font:300 30px/1 Georgia,'Times New Roman',serif;color:#142821">Devote</div>
  <div style="font:500 8px/1 Helvetica,Arial,sans-serif;letter-spacing:.42em;color:#7f6d51;margin-top:6px">RESIDENCE CONCIERGE</div>
</td></tr>
<tr><td style="padding:28px 0">
  <div style="font:500 20px/1.6 'Hiragino Mincho ProN','Yu Mincho',serif;color:#142821">メールアドレスのご確認</div>
  <p style="font-size:14px;line-height:1.9;color:#675e53;margin:12px 0 24px">Devote のコンシェルジュです。<br>下のボタンを押すと、物件のお届けをこのメールアドレスで受け取れるようになります（24時間有効）。</p>
  <a href="${link}" style="display:inline-block;padding:13px 30px;border-radius:999px;background:#1b3a2e;color:#f7efe2;font:500 13px Helvetica,Arial,sans-serif;letter-spacing:.14em;text-decoration:none">メールアドレスを確認する</a>
  <p style="font-size:12px;line-height:1.8;color:#a39886;margin-top:28px">お心当たりがない場合は、このメールを破棄してください。</p>
</td></tr>
</table></body></html>`;
}

/** LINE 連携コード（6桁）を発行。ユーザーは公式アカウントにこのコードを送る */
export async function issueLineLinkCode() {
  const userId = await ensureUserId();
  const db = getDb();
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = String(randomInt(100000, 1000000));
    const [dup] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, `line:${code}`),
          isNull(verificationTokens.usedAt),
          gt(verificationTokens.expiresAt, new Date()),
        ),
      );
    if (!dup) break;
  }
  await db
    .insert(verificationTokens)
    .values({
      token: `line:${code}`,
      userId,
      purpose: "line_link",
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    .onConflictDoUpdate({
      target: verificationTokens.token,
      set: { userId, expiresAt: new Date(Date.now() + 30 * 60_000), usedAt: null },
    });
  // 公式アカウントの ID があれば、コード入力済みのトーク画面を直接開く（友だち追加もLINE内で完結）
  const oaId = process.env.NEXT_PUBLIC_LINE_OA_ID;
  if (oaId) redirect(`https://line.me/R/oaMessage/${encodeURIComponent(oaId)}/?${code}`);
  redirect(`/settings?lineCode=${code}`);
}

export async function disconnectChannel(formData: FormData) {
  const userId = await currentUserId();
  if (!userId) redirect("/settings");
  const id = String(formData.get("channelId"));
  await getDb()
    .update(userChannels)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(userChannels.id, id), eq(userChannels.userId, userId)));
  revalidatePath("/settings");
}

/** 内見の問い合わせ */
export async function createInquiry(formData: FormData) {
  const userId = await ensureUserId();
  const propertyId = String(formData.get("propertyId"));
  const contactName = String(formData.get("name") ?? "").trim();
  const contactPhone = String(formData.get("phone") ?? "").trim();
  const contactEmail = String(formData.get("email") ?? "").trim();
  // 担当から連絡できない依頼は受け付けない
  if (!contactName || (!contactPhone && !contactEmail)) {
    redirect(`/properties/${propertyId}?inquiry=invalid#inquiry`);
  }
  const dates = [
    String(formData.get("dates") ?? "").trim(),
    String(formData.get("datesNote") ?? "").trim(),
  ]
    .filter(Boolean)
    .join("／");
  const db = getDb();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!p) redirect("/matches");
  await db.insert(inquiries).values({
    userId,
    propertyId,
    contactName,
    contactPhone: contactPhone || null,
    contactEmail: contactEmail || null,
    preferredDates: dates || null,
    message: String(formData.get("message") ?? "").trim() || null,
  });
  redirect("/inquiries?created=1");
}
