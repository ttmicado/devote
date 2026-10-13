import { randomUUID } from "node:crypto";
import { type NormalizedListing, PHASE_GATE, type SearchPhase } from "@devote/core";
import { type Db, matches, notifications, properties, sentLedger, userChannels } from "@devote/db";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { activeConditions } from "../match";
import { sendEmail } from "./email";
import { buildEmail, buildLineMessages, type NotifyItem } from "./format";
import { lineQuotaConsumption, pushLine } from "./line";

type Reason = "new" | "price_down" | "similar";

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** JST の時・曜日 */
function jst(now: Date) {
  const d = new Date(now.getTime() + 9 * 3600_000);
  return { hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

/** LINE の月間無料通数（コミュニケーションプラン=200）。超えそうならメールに切り替える */
const LINE_MONTHLY_LIMIT = Number(process.env.LINE_MONTHLY_LIMIT ?? 200);

async function channelsFor(db: Db, userId: string) {
  return db
    .select()
    .from(userChannels)
    .where(and(eq(userChannels.userId, userId), eq(userChannels.active, true)))
    .orderBy(asc(userChannels.priority));
}

/**
 * 物件をユーザーに1通にまとめて送る。
 * 送信済み台帳（sent_ledger）に先に書き込み、書き込めた物件だけを送る（二重送信防止）。
 * 送信に失敗したら台帳を戻し、次回に再送できるようにする。
 */
export async function sendPropertiesToUser(
  db: Db,
  args: {
    userId: string;
    items: NotifyItem[];
    reason: Reason;
    heading: string;
    lineUsage?: { count: number | null };
  },
): Promise<{
  status: "sent" | "skipped" | "failed";
  channel?: string;
  count: number;
  error?: string;
}> {
  const channels = await channelsFor(db, args.userId);
  if (channels.length === 0 || args.items.length === 0) return { status: "skipped", count: 0 };

  const notificationId = randomUUID();
  const inserted = await db
    .insert(sentLedger)
    .values(
      args.items.map((i) => ({
        userId: args.userId,
        propertyId: i.propertyId,
        reason: args.reason,
        notificationId,
      })),
    )
    .onConflictDoNothing()
    .returning({ propertyId: sentLedger.propertyId });
  const ids = new Set(inserted.map((r) => r.propertyId));
  const items = args.items.filter((i) => ids.has(i.propertyId));
  if (items.length === 0) return { status: "skipped", count: 0 };

  const base = appUrl();
  const errors: string[] = [];
  for (const ch of channels) {
    try {
      if (ch.channel === "line") {
        const usage = args.lineUsage?.count;
        if (usage != null && usage >= LINE_MONTHLY_LIMIT) {
          errors.push("line: 月間無料通数の上限");
          continue;
        }
        await pushLine(
          ch.address,
          buildLineMessages(items, { appUrl: base, notificationId, heading: args.heading }),
          notificationId,
        );
        if (args.lineUsage && args.lineUsage.count != null) args.lineUsage.count++;
      } else if (ch.channel === "email") {
        const mail = buildEmail(items, {
          appUrl: base,
          notificationId,
          heading: args.heading,
          settingsUrl: `${base}/settings`,
        });
        await sendEmail({
          to: ch.address,
          ...mail,
          idempotencyKey: notificationId,
          unsubscribeUrl: `${base}/settings`,
        });
      } else {
        continue; // Instagram は定期通知に使わない
      }
      await db.insert(notifications).values({
        id: notificationId,
        userId: args.userId,
        channel: ch.channel,
        status: "sent",
        propertyIds: items.map((i) => i.propertyId),
        scheduledAt: new Date(),
        sentAt: new Date(),
      });
      return { status: "sent", channel: ch.channel, count: items.length };
    } catch (e) {
      errors.push(`${ch.channel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // すべてのチャネルで失敗 → 台帳を戻す
  await db.delete(sentLedger).where(eq(sentLedger.notificationId, notificationId));
  await db.insert(notifications).values({
    id: notificationId,
    userId: args.userId,
    channel: channels[0]?.channel ?? "email",
    status: "failed",
    propertyIds: items.map((i) => i.propertyId),
    scheduledAt: new Date(),
    error: errors.join(" / "),
  });
  return { status: "failed", count: 0, error: errors.join(" / ") };
}

function isDue(
  frequency: "instant" | "daily" | "weekly",
  sendHour: number,
  lastSentAt: Date | null,
  now: Date,
): boolean {
  const { hour, weekday } = jst(now);
  const since = lastSentAt ? now.getTime() - lastSentAt.getTime() : Number.POSITIVE_INFINITY;
  if (frequency === "instant") return since > 10 * 60_000; // 連続送信を避けるため10分空ける
  if (frequency === "daily") return hour === sendHour && since > 20 * 3600_000;
  return weekday === 1 && hour === sendHour && since > 6 * 24 * 3600_000; // 毎週月曜
}

/** 定期通知: 送信タイミングが来たユーザーに、未送信のマッチをフェーズのゲージで絞って送る */
export async function runNotifications(db: Db, now = new Date()) {
  const conds = await activeConditions(db);
  const lineUsage = {
    count: process.env.LINE_CHANNEL_ACCESS_TOKEN
      ? await lineQuotaConsumption().catch(() => null)
      : null,
  };
  const summary = { due: 0, sent: 0, skipped: 0, failed: 0, errors: [] as string[] };

  for (const c of conds) {
    const [last] = await db
      .select({ sentAt: notifications.sentAt })
      .from(notifications)
      .where(and(eq(notifications.userId, c.userId), eq(notifications.status, "sent")))
      .orderBy(desc(notifications.sentAt))
      .limit(1);
    if (!isDue(c.frequency, c.sendHour, last?.sentAt ?? null, now)) continue;
    summary.due++;

    const gate = PHASE_GATE[c.phase as SearchPhase];
    const rows = await db
      .select({
        propertyId: matches.propertyId,
        score: matches.score,
        reasons: matches.reasons,
        data: properties.data,
      })
      .from(matches)
      .innerJoin(properties, eq(properties.id, matches.propertyId))
      .where(
        and(
          eq(matches.userId, c.userId),
          eq(matches.conditionVersion, c.version),
          eq(properties.status, "active"),
          gt(matches.score, gate.minScore - 1),
          sql`not exists (select 1 from ${sentLedger} sl where sl.user_id = ${matches.userId} and sl.property_id = ${matches.propertyId} and sl.reason = 'new')`,
        ),
      )
      .orderBy(desc(matches.score))
      .limit(gate.maxItems);
    if (rows.length === 0) {
      summary.skipped++;
      continue;
    }
    const items: NotifyItem[] = rows.map((r) => ({
      propertyId: r.propertyId,
      listing: r.data as NormalizedListing,
      score: r.score,
      reasons: (r.reasons as string[]) ?? [],
    }));
    const res = await sendPropertiesToUser(db, {
      userId: c.userId,
      items,
      reason: "new",
      heading: "あなたの条件に合う新着物件",
      lineUsage,
    });
    summary[res.status]++;
    if (res.error) summary.errors.push(res.error);
  }
  return summary;
}

/** 物件IDから通知用アイテムを組み立てる（管理画面からの類似物件送信など） */
export async function loadNotifyItems(db: Db, propertyIds: string[]): Promise<NotifyItem[]> {
  if (propertyIds.length === 0) return [];
  const rows = await db
    .select({ id: properties.id, data: properties.data })
    .from(properties)
    .where(inArray(properties.id, propertyIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return propertyIds.flatMap((id) => {
    const r = byId.get(id);
    return r
      ? [{ propertyId: id, listing: r.data as NormalizedListing, score: null, reasons: [] }]
      : [];
  });
}
