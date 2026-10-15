import { randomUUID } from "node:crypto";
import { formatYen, type NormalizedListing, PHASE_GATE, type SearchPhase } from "@devote/core";
import {
  changeEvents,
  type Db,
  matches,
  notifications,
  properties,
  sentLedger,
  userChannels,
  users,
} from "@devote/db";
import { and, asc, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { personalLink } from "../link-token";
import { activeConditions } from "../match";
import { sendEmail } from "./email";
import { buildEmail, buildLineMessages, type NotifyItem, type NotifyKind } from "./format";
import { isPermanentLineFailure, lineQuotaConsumption, pushLine } from "./line";
import { unsubscribeUrl } from "./unsubscribe-token";

type Reason = "new" | "price_down" | "similar";

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** JST の今日 0:00 */
function startOfTodayJst(now: Date) {
  const d = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 9 * 3600_000);
}

/** JST の時・曜日 */
function jst(now: Date) {
  const d = new Date(now.getTime() + 9 * 3600_000);
  return { hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

/** 総額（賃貸は管理費込み）。並び順に使う */
const totalPriceSql = sql`${properties.price} + case when ${properties.dealType} = 'rent' then coalesce((${properties.data}->>'managementFee')::bigint, 0) else 0 end`;

/** 夜間（22時〜8時 JST）は通知を控える */
function isQuietHours(now: Date) {
  const { hour } = jst(now);
  return hour >= 22 || hour < 8;
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

/** 送信済み台帳に書き込み、書き込めた（＝まだ送っていない）物件IDを返す */
async function claimLedger(
  db: Db,
  args: {
    userId: string;
    items: NotifyItem[];
    reason: Reason;
    notificationId: string;
    /** 値下げ: 物件ごとの検知時刻。台帳の記録がこれより古ければ、新しい値下げとして送り直す */
    claimSince?: Record<string, Date>;
  },
): Promise<Set<string>> {
  if (!args.claimSince) {
    const inserted = await db
      .insert(sentLedger)
      .values(
        args.items.map((i) => ({
          userId: args.userId,
          propertyId: i.propertyId,
          reason: args.reason,
          notificationId: args.notificationId,
        })),
      )
      .onConflictDoNothing()
      .returning({ propertyId: sentLedger.propertyId });
    return new Set(inserted.map((r) => r.propertyId));
  }
  const ids = new Set<string>();
  for (const i of args.items) {
    const since = args.claimSince[i.propertyId];
    if (!since) continue;
    const [row] = await db
      .insert(sentLedger)
      .values({
        userId: args.userId,
        propertyId: i.propertyId,
        reason: args.reason,
        notificationId: args.notificationId,
      })
      .onConflictDoUpdate({
        target: [sentLedger.userId, sentLedger.propertyId, sentLedger.reason],
        set: { notificationId: args.notificationId, sentAt: sql`now()` },
        setWhere: lt(sentLedger.sentAt, since),
      })
      .returning({ propertyId: sentLedger.propertyId });
    if (row) ids.add(row.propertyId);
  }
  return ids;
}

/**
 * 物件をユーザーに1通にまとめて送る。
 * - 送信済み台帳（sent_ledger）に先に書き込み、書き込めた物件だけを送る（二重送信防止）
 * - チャネルは優先順に試し、1つ成功したらそこで止める（ほかのチャネルには送らない）
 * - 送信の成否と記録（notifications）は分ける。送信後に記録だけ失敗しても、再送はしない
 * - すべてのチャネルで失敗したら台帳を戻し、次回に再送できるようにする
 * - LINE の友だち解除・ブロックなど恒久的な失敗は、そのチャネルを無効にする
 */
export async function sendPropertiesToUser(
  db: Db,
  args: {
    userId: string;
    items: NotifyItem[];
    reason: Reason;
    /** 通知の種類（文言が変わる） */
    kind: NotifyKind;
    lineUsage?: { count: number | null };
    /** 値下げ通知の1文（kind = "price_down"） */
    detail?: string;
    /** 値下げ: 物件ごとの検知時刻（claimLedger 参照） */
    claimSince?: Record<string, Date>;
  },
): Promise<{
  status: "sent" | "skipped" | "failed";
  channel?: string;
  count: number;
  error?: string;
}> {
  const channels = await channelsFor(db, args.userId);
  const [person] = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(eq(users.id, args.userId));
  if (channels.length === 0 || args.items.length === 0) return { status: "skipped", count: 0 };

  const notificationId = randomUUID();
  const ids = await claimLedger(db, {
    userId: args.userId,
    items: args.items,
    reason: args.reason,
    notificationId,
    claimSince: args.claimSince,
  });
  const items = args.items.filter((i) => ids.has(i.propertyId));
  if (items.length === 0) return { status: "skipped", count: 0 };

  const base = appUrl();
  const errors: string[] = [];
  let sentVia: (typeof channels)[number] | null = null;
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
          buildLineMessages(items, {
            appUrl: base,
            notificationId,
            kind: args.kind,
            userId: args.userId,
            detail: args.detail,
          }),
          notificationId,
        );
        if (args.lineUsage && args.lineUsage.count != null) args.lineUsage.count++;
      } else if (ch.channel === "email") {
        const unsub = unsubscribeUrl(base, args.userId);
        const mail = buildEmail(items, {
          appUrl: base,
          notificationId,
          kind: args.kind,
          userId: args.userId,
          nickname: person?.nickname,
          settingsUrl: personalLink(base, "/settings", args.userId),
          unsubscribeUrl: unsub,
          detail: args.detail,
        });
        await sendEmail({
          to: ch.address,
          ...mail,
          idempotencyKey: notificationId,
          unsubscribeUrl: unsub,
        });
      } else {
        continue; // Instagram は定期通知に使わない
      }
      sentVia = ch;
      break; // 1つのチャネルで届いたら、ほかには送らない
    } catch (e) {
      errors.push(`${ch.channel}: ${e instanceof Error ? e.message : String(e)}`);
      if (ch.channel === "line" && isPermanentLineFailure(e)) {
        // 友だち解除・ブロック: 以後このチャネルには送らない（次のチャネルで届ける）
        await db
          .update(userChannels)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(userChannels.id, ch.id))
          .catch((err) => console.error("[notify] LINE チャネルの無効化に失敗", err));
      }
    }
  }

  if (sentVia) {
    // 送信は済んでいる。記録に失敗しても再送はせず、ログに残すだけにする
    try {
      await db.insert(notifications).values({
        id: notificationId,
        userId: args.userId,
        channel: sentVia.channel,
        status: "sent",
        propertyIds: items.map((i) => i.propertyId),
        scheduledAt: new Date(),
        sentAt: new Date(),
        error: errors.length > 0 ? errors.join(" / ") : null,
      });
    } catch (e) {
      console.error("[notify] 送信済みの記録に失敗（再送はしない）", notificationId, e);
    }
    return { status: "sent", channel: sentVia.channel, count: items.length };
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
  if (frequency === "instant") {
    // 夜間（22時〜8時）は控え、朝8時以降にまとめて届ける。連続送信を避けるため10分空ける
    if (isQuietHours(now)) return false;
    return since > 10 * 60_000;
  }
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
    // 「すぐに」でも1日に届く件数は検討段階ごとの上限まで（煩わしくならないように）
    const [today] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sentLedger)
      .where(
        and(
          eq(sentLedger.userId, c.userId),
          eq(sentLedger.reason, "new"),
          gte(sentLedger.sentAt, startOfTodayJst(now)),
        ),
      );
    const remainingToday = gate.maxItems - (today?.n ?? 0);
    if (remainingToday <= 0) {
      summary.skipped++;
      continue;
    }
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
      // スコアの高い順 → 新しい物件 → 総額の安い順（core の compareRank と同じ）
      .orderBy(desc(matches.score), desc(properties.createdAt), asc(totalPriceSql))
      .limit(remainingToday);
    if (rows.length === 0) {
      summary.skipped++;
      continue;
    }
    const showScore = c.condition.soft.length > 0;
    const items: NotifyItem[] = rows.map((r) => ({
      propertyId: r.propertyId,
      listing: r.data as NormalizedListing,
      score: r.score,
      reasons: (r.reasons as string[]) ?? [],
      showScore,
    }));
    const res = await sendPropertiesToUser(db, {
      userId: c.userId,
      items,
      reason: "new",
      kind: "new",
      lineUsage,
    });
    summary[res.status]++;
    if (res.error) summary.errors.push(res.error);
  }
  // 値下げのお知らせ（1日の上限には数えない）
  const priceDown = await runPriceDropNotifications(db, now, lineUsage).catch((e) => {
    summary.errors.push(`price_down: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
  return { ...summary, priceDown };
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

/** 値下げを見に行く期間（これより前の値下げは今さら送らない） */
const PRICE_DROP_LOOKBACK_MS = 3 * 24 * 3600_000;

interface PriceDrop {
  propertyId: string;
  detectedAt: Date;
  beforeTotal: number;
  afterTotal: number;
}

/** change_events の before/after から総額を読む（ingest が total を入れる。古い記録は price だけ） */
function totalOf(v: unknown): number | null {
  if (v == null || typeof v !== "object") return null;
  const o = v as { total?: unknown; price?: unknown };
  if (typeof o.total === "number") return o.total;
  return typeof o.price === "number" ? o.price : null;
}

/**
 * 値下げのお知らせ。
 * - 直近の price_down（総額が下がった）を拾い、その物件を以前お届けした（sent_ledger reason=new）ユーザーに送る
 * - いまの条件でもマッチしている（matches がある）こと、検討段階が considering / ready であること
 * - 同じ値下げは二度送らない（sent_ledger reason=price_down。より新しい値下げなら送り直す）
 * - 1日の上限には数えない。夜間（22時〜8時）は送らない
 */
export async function runPriceDropNotifications(
  db: Db,
  now = new Date(),
  lineUsage?: { count: number | null },
) {
  const summary = { candidates: 0, sent: 0, skipped: 0, failed: 0, errors: [] as string[] };
  if (isQuietHours(now)) return summary;

  const events = await db
    .select({
      propertyId: changeEvents.propertyId,
      before: changeEvents.before,
      after: changeEvents.after,
      detectedAt: changeEvents.detectedAt,
    })
    .from(changeEvents)
    .where(
      and(
        eq(changeEvents.type, "price_down"),
        gte(changeEvents.detectedAt, new Date(now.getTime() - PRICE_DROP_LOOKBACK_MS)),
      ),
    )
    .orderBy(asc(changeEvents.detectedAt));
  // 物件ごとに、期間内の最初の値下げ前 → 最新の値下げ後 にまとめる
  const drops = new Map<string, PriceDrop>();
  for (const e of events) {
    if (!e.propertyId) continue;
    const before = totalOf(e.before);
    const after = totalOf(e.after);
    if (before == null || after == null || after >= before) continue;
    const prev = drops.get(e.propertyId);
    drops.set(e.propertyId, {
      propertyId: e.propertyId,
      detectedAt: e.detectedAt,
      beforeTotal: prev?.beforeTotal ?? before,
      afterTotal: after,
    });
  }
  if (drops.size === 0) return summary;

  const conds = (await activeConditions(db)).filter(
    (c) => c.phase === "considering" || c.phase === "ready",
  );
  for (const c of conds) {
    const rows = await db
      .select({
        propertyId: matches.propertyId,
        score: matches.score,
        data: properties.data,
      })
      .from(matches)
      .innerJoin(properties, eq(properties.id, matches.propertyId))
      .innerJoin(
        sentLedger,
        and(
          eq(sentLedger.userId, matches.userId),
          eq(sentLedger.propertyId, matches.propertyId),
          eq(sentLedger.reason, "new"),
        ),
      )
      .where(
        and(
          eq(matches.userId, c.userId),
          eq(matches.conditionVersion, c.version),
          eq(properties.status, "active"),
          inArray(matches.propertyId, [...drops.keys()]),
        ),
      )
      .orderBy(desc(matches.score), desc(properties.createdAt), asc(totalPriceSql));
    if (rows.length === 0) continue;
    summary.candidates += rows.length;

    const items: NotifyItem[] = rows.map((r) => {
      const d = drops.get(r.propertyId) as PriceDrop;
      return {
        propertyId: r.propertyId,
        listing: r.data as NormalizedListing,
        score: r.score,
        reasons: [
          `総額が ${formatYen(d.beforeTotal)} → ${formatYen(d.afterTotal)} に改定されました`,
        ],
        showScore: false,
      };
    });
    const first = rows[0];
    const firstDrop = first ? drops.get(first.propertyId) : undefined;
    const detail =
      rows.length === 1 && first && firstDrop
        ? priceDropSentence((first.data as NormalizedListing).title, firstDrop)
        : undefined;
    const res = await sendPropertiesToUser(db, {
      userId: c.userId,
      items,
      reason: "price_down",
      kind: "price_down",
      lineUsage,
      detail,
      claimSince: Object.fromEntries(
        rows.map((r) => [r.propertyId, drops.get(r.propertyId)?.detectedAt as Date]),
      ),
    });
    summary[res.status]++;
    if (res.error) summary.errors.push(res.error);
  }
  return summary;
}

/** 「先日お届けした『○○』の総額が 98万円 → 92万円 に改定されました」 */
export function priceDropSentence(
  title: string | null,
  d: { beforeTotal: number; afterTotal: number },
): string {
  return `先日お届けした『${title ?? "物件"}』の総額が ${formatYen(d.beforeTotal)} → ${formatYen(d.afterTotal)} に改定されました`;
}
