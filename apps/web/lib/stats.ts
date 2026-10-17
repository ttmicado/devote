import {
  crawlRuns,
  getDb,
  matches,
  notifications,
  properties,
  searchConditions,
  userChannels,
} from "@devote/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/** JST の今日 0:00 */
function startOfTodayJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600_000,
  );
}

/**
 * 巡回の実績（トップページ・本日のご報告で使う）。すべて実データ。
 * 巡回が失敗したソースがあれば正直に件数を返す（数字を盛らない）。
 */
export async function crawlSummary(now = new Date()) {
  const db = getDb();
  const since = startOfTodayJst(now);
  const [today] = await db
    .select({
      sources: sql<number>`count(distinct ${crawlRuns.source}) filter (where ${crawlRuns.status} = 'succeeded')::int`,
      checked: sql<number>`coalesce(sum(${crawlRuns.seen}) filter (where ${crawlRuns.status} = 'succeeded'), 0)::int`,
      newCount: sql<number>`coalesce(sum(${crawlRuns.newCount}), 0)::int`,
      lastFinished: sql<Date | null>`max(${crawlRuns.finishedAt})`,
    })
    .from(crawlRuns)
    .where(gte(crawlRuns.startedAt, since));
  // 遅れているサイト: 今日の最新の巡回が失敗したままのソース（後の回で成功していれば数えない）。
  // 生の SQL に Date をそのまま渡すと postgres-js が受け付けないので、ISO 文字列にして渡す
  const [failed] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select distinct on (${crawlRuns.source}) ${crawlRuns.status} as status
      from ${crawlRuns}
      where ${crawlRuns.startedAt} >= ${since.toISOString()}::timestamptz and ${crawlRuns.status} <> 'running'
      order by ${crawlRuns.source}, ${crawlRuns.startedAt} desc
    ) latest where status = 'failed'`);
  const [inventory] = await db
    .select({
      active: sql<number>`count(*)::int`,
      rent: sql<number>`count(*) filter (where ${properties.dealType} = 'rent')::int`,
      sale: sql<number>`count(*) filter (where ${properties.dealType} = 'sale')::int`,
    })
    .from(properties)
    .where(eq(properties.status, "active"));
  return {
    sourcesToday: today?.sources ?? 0,
    failedSourcesToday: Number(failed?.n ?? 0),
    checkedToday: today?.checked ?? 0,
    newToday: today?.newCount ?? 0,
    lastCheckedAt: today?.lastFinished ? new Date(today.lastFinished) : null,
    activeProperties: inventory?.active ?? 0,
    activeRent: inventory?.rent ?? 0,
    activeSale: inventory?.sale ?? 0,
  };
}

/** ユーザー向け「本日のご報告」: 巡回状況＋その人の条件に合う件数＋お届け予定 */
export async function userReport(userId: string, now = new Date()) {
  const db = getDb();
  const crawl = await crawlSummary(now);
  const [cond] = await db
    .select()
    .from(searchConditions)
    .where(eq(searchConditions.userId, userId))
    .orderBy(desc(searchConditions.version))
    .limit(1);
  if (!cond) return { crawl, condition: null };
  const [matched] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .innerJoin(properties, eq(properties.id, matches.propertyId))
    .where(
      and(
        eq(matches.userId, userId),
        eq(matches.conditionVersion, cond.version),
        eq(properties.status, "active"),
      ),
    );
  const [last] = await db
    .select({
      sentAt: notifications.sentAt,
      count: sql<number>`cardinality(${notifications.propertyIds})::int`,
      channel: notifications.channel,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.status, "sent")))
    .orderBy(desc(notifications.sentAt))
    .limit(1);
  const channels = await db
    .select({ channel: userChannels.channel })
    .from(userChannels)
    .where(and(eq(userChannels.userId, userId), eq(userChannels.active, true)));
  return {
    crawl,
    condition: {
      frequency: cond.frequency,
      sendHour: cond.sendHour,
      phase: cond.phase,
      active: cond.active,
    },
    matchedActive: matched?.n ?? 0,
    lastDelivery: last?.sentAt
      ? { at: last.sentAt, count: last.count, channel: last.channel }
      : null,
    channels: [...new Set(channels.map((c) => c.channel))],
  };
}

/** "14:30" / "10/12 19:00"（JST） */
export function formatJst(d: Date, withDate = false) {
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    ...(withDate ? { month: "numeric", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}
