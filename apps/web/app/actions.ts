"use server";

import { randomBytes, randomInt } from "node:crypto";
import { SearchCondition } from "@devote/core";
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
    frequency: prev?.frequency ?? "daily",
    sendHour: prev?.sendHour ?? 19,
  });
  // 確定した条件ですぐにマッチングして一覧に出す
  await runMatching(db);
  redirect("/matches?confirmed=1");
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
  revalidatePath("/settings");
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
  await sendEmail({
    to: email,
    subject: "【Devote】メールアドレスの確認",
    text: `以下のリンクを開くと、Devote の物件通知をこのメールアドレスで受け取れるようになります。\n${link}\n\n心当たりがない場合はこのメールを破棄してください。`,
    html: `<p>以下のリンクを開くと、Devote の物件通知をこのメールアドレスで受け取れるようになります。</p><p><a href="${link}">メールアドレスを確認する</a></p><p style="color:#888">心当たりがない場合はこのメールを破棄してください。</p>`,
  });
  redirect("/settings?email=sent");
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
  if (!contactName) redirect(`/properties/${propertyId}?inquiry=invalid#inquiry`);
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
    contactPhone: String(formData.get("phone") ?? "").trim() || null,
    contactEmail: String(formData.get("email") ?? "").trim() || null,
    preferredDates: String(formData.get("dates") ?? "").trim() || null,
    message: String(formData.get("message") ?? "").trim() || null,
  });
  redirect("/inquiries?created=1");
}
