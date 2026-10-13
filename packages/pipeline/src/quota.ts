import { type Db, sourceUsage } from "@devote/db";
import type { SourceMeta } from "@devote/scraper";
import { and, eq, gte, lte, sql } from "drizzle-orm";

type Kind = "list" | "detail";

/** JST の日付・時・月末までの残り日数 */
export function jstCalendar(now: Date) {
  const d = new Date(now.getTime() + 9 * 3600_000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    hour: d.getUTCHours(),
    today: `${y}-${pad(m + 1)}-${pad(day)}`,
    monthStart: `${y}-${pad(m + 1)}-01`,
    monthEnd: `${y}-${pad(m + 1)}-${pad(daysInMonth)}`,
    /** 今日を含む残り日数 */
    daysLeft: daysInMonth - day + 1,
  };
}

/**
 * 今回の巡回で使ってよい件数。
 * 月の残り枠を残り日数で割った「今日の配分」から、今日すでに使った分を引く。
 * → 月初に使い切って月末に止まる、ということが起きない。
 */
export function allowanceForRun(args: {
  monthlyLimit: number;
  usedThisMonth: number;
  usedToday: number;
  daysLeft: number;
}): number {
  const remainingMonth = Math.max(0, args.monthlyLimit - args.usedThisMonth);
  // 今日の分は「今日の使用量 + 残り枠」を残り日数で割った値（今日使った分も今日の配分に含める）
  const todayBudget = Math.floor((remainingMonth + args.usedToday) / args.daysLeft);
  return Math.max(0, Math.min(remainingMonth, todayBudget - args.usedToday));
}

export function isWithinActiveHours(hours: [number, number] | undefined, hourJst: number): boolean {
  if (!hours) return true;
  const [start, end] = hours;
  return start <= end ? hourJst >= start && hourJst < end : hourJst >= start || hourJst < end;
}

async function usage(db: Db, source: string, kind: Kind, from: string, to: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${sourceUsage.count}), 0)::int` })
    .from(sourceUsage)
    .where(
      and(
        eq(sourceUsage.source, source),
        eq(sourceUsage.kind, kind),
        gte(sourceUsage.day, from),
        lte(sourceUsage.day, to),
      ),
    );
  return row?.n ?? 0;
}

/** ソースの月間上限から今回の巡回の上限を求める（上限の無い種別は undefined） */
export async function budgetForRun(db: Db, meta: SourceMeta, now = new Date()) {
  const quota = meta.monthlyQuota;
  if (!quota) return { list: undefined, detail: undefined };
  const cal = jstCalendar(now);
  const calc = async (kind: Kind) => {
    const limit = quota[kind];
    if (limit == null) return undefined;
    return allowanceForRun({
      monthlyLimit: limit,
      usedThisMonth: await usage(db, meta.id, kind, cal.monthStart, cal.monthEnd),
      usedToday: await usage(db, meta.id, kind, cal.today, cal.today),
      daysLeft: cal.daysLeft,
    });
  };
  return { list: await calc("list"), detail: await calc("detail") };
}

export async function recordUsage(
  db: Db,
  source: string,
  counts: Partial<Record<Kind | "drawing", number>>,
  now = new Date(),
) {
  const { today } = jstCalendar(now);
  for (const [kind, n] of Object.entries(counts)) {
    if (!n) continue;
    await db
      .insert(sourceUsage)
      .values({ source, day: today, kind: kind as Kind, count: n })
      .onConflictDoUpdate({
        target: [sourceUsage.source, sourceUsage.day, sourceUsage.kind],
        set: { count: sql`${sourceUsage.count} + ${n}` },
      });
  }
}
